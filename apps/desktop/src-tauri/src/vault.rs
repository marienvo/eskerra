use std::fs;
use std::io::Read;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use base64::Engine;
use serde::Serialize;
use tauri::State;

const ASSETS_DIR: &str = "Assets";
const ATTACHMENTS_DIR: &str = "Attachments";
const MARKDOWN_REL_ATTACHMENTS_PREFIX: &str = "../Assets/Attachments";

#[derive(Default)]
pub struct VaultRootState(pub Mutex<Option<PathBuf>>);

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultDirEntryDto {
    pub uri: String,
    pub name: String,
    #[serde(rename = "lastModified")]
    pub last_modified: Option<u64>,
    #[serde(rename = "type")]
    pub entry_type: String,
}

fn normalize_vault_root(path: &Path) -> Result<PathBuf, String> {
    let meta = fs::metadata(path).map_err(|e| format!("vault root: {e}"))?;
    if !meta.is_dir() {
        return Err("vault root must be a directory".into());
    }
    path.canonicalize()
        .map_err(|e| format!("could not canonicalize vault root: {e}"))
}

fn is_subpath(vault: &Path, candidate: &Path) -> bool {
    let Ok(vault_canon) = vault.canonicalize() else {
        return false;
    };
    let Ok(candidate_canon) = candidate.canonicalize() else {
        let v = vault_canon.to_string_lossy();
        let c = candidate.to_string_lossy();
        return c.starts_with(v.as_ref()) && (c.len() == v.len() || c[v.len()..].starts_with('/'));
    };
    candidate_canon.starts_with(&vault_canon)
}

fn assert_in_vault(vault: Option<&PathBuf>, target: &Path) -> Result<(), String> {
    let Some(root) = vault else {
        return Err("no vault session; pick a folder first".into());
    };
    if !is_subpath(root, target) {
        return Err("path is outside the selected vault".into());
    }
    Ok(())
}

fn vault_attachments_dir(root: &Path) -> PathBuf {
    root.join(ASSETS_DIR).join(ATTACHMENTS_DIR)
}

fn sanitize_attachment_stem(raw: &str) -> String {
    let base: String = raw.chars().filter(|c| *c != '/' && *c != '\\').collect();
    let stem = base
        .rsplit_once('.')
        .map(|(s, _)| s)
        .unwrap_or(base.as_str());
    let mut normalized = String::new();
    for c in stem.to_lowercase().chars() {
        if c.is_ascii_alphanumeric() || c == '-' || c == '_' {
            normalized.push(c);
        } else if c.is_whitespace() {
            normalized.push('-');
        }
    }
    while normalized.contains("--") {
        normalized = normalized.replace("--", "-");
    }
    let trimmed = normalized.trim_matches(|c| c == '-' || c == '_');
    if trimmed.is_empty() {
        "image".to_string()
    } else {
        trimmed.to_string()
    }
}

fn image_ext_from_path(path: &Path) -> Option<String> {
    let name = path.file_name()?.to_string_lossy();
    let lower = name.to_lowercase();
    let ext = lower.rsplit_once('.')?.1;
    match ext {
        "png" => Some("png".into()),
        "jpg" | "jpeg" => Some("jpg".into()),
        "gif" => Some("gif".into()),
        "webp" => Some("webp".into()),
        "svg" => Some("svg".into()),
        _ => None,
    }
}

fn sniff_image_matches_extension(buf: &[u8], ext: &str) -> bool {
    let trimmed: &[u8] = buf.strip_prefix(b"\xef\xbb\xbf").unwrap_or(buf);
    match ext {
        "png" => buf.starts_with(b"\x89PNG\r\n\x1a\n"),
        "jpg" => buf.len() >= 3 && buf[0] == 0xff && buf[1] == 0xd8 && buf[2] == 0xff,
        "gif" => buf.starts_with(b"GIF87a") || buf.starts_with(b"GIF89a"),
        "webp" => {
            buf.len() >= 12 && buf.starts_with(b"RIFF") && buf[8..12].eq_ignore_ascii_case(b"WEBP")
        }
        "svg" => {
            let prefix = String::from_utf8_lossy(trimmed);
            let p = prefix.trim_start();
            p.starts_with("<svg") || p.starts_with("<?xml") || p.contains("<svg")
        }
        _ => false,
    }
}

fn validate_source_image_file(path: &Path, ext: &str) -> Result<(), String> {
    let mut f = fs::File::open(path).map_err(|e| e.to_string())?;
    let mut buf = [0u8; 64];
    let n = f.read(&mut buf).map_err(|e| e.to_string())?;
    if !sniff_image_matches_extension(&buf[..n], ext) {
        return Err(format!(
            "file does not look like a {} image: {}",
            ext,
            path.display()
        ));
    }
    Ok(())
}

#[tauri::command]
pub fn vault_set_session(
    state: State<'_, VaultRootState>,
    root_path: String,
) -> Result<(), String> {
    let path = PathBuf::from(root_path.trim());
    let normalized = normalize_vault_root(&path)?;
    *state.0.lock().map_err(|e| e.to_string())? = Some(normalized);
    Ok(())
}

#[tauri::command]
pub fn vault_get_session(state: State<'_, VaultRootState>) -> Result<Option<String>, String> {
    let guard = state.0.lock().map_err(|e| e.to_string())?;
    Ok(guard.as_ref().map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn vault_exists(state: State<'_, VaultRootState>, path: String) -> Result<bool, String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    Ok(target.exists())
}

#[tauri::command]
pub fn vault_mkdir(state: State<'_, VaultRootState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    fs::create_dir_all(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_read_file(state: State<'_, VaultRootState>, path: String) -> Result<String, String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    fs::read_to_string(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_write_file(
    state: State<'_, VaultRootState>,
    path: String,
    contents: String,
) -> Result<(), String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, contents.as_bytes()).map_err(|e| e.to_string())
}

/// Writes raw file bytes (for example pasted images). `contents_base64` is standard Base64.
#[tauri::command]
pub fn vault_write_file_bytes(
    state: State<'_, VaultRootState>,
    path: String,
    contents_base64: String,
) -> Result<(), String> {
    let bytes = base64::engine::general_purpose::STANDARD
        .decode(contents_base64.trim().as_bytes())
        .map_err(|e| format!("invalid base64: {e}"))?;
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    if let Some(parent) = target.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(&target, bytes).map_err(|e| e.to_string())
}

/// Copies image files from arbitrary OS paths into `Assets/Attachments/` inside the vault.
/// Returns relative Markdown paths from an `Inbox/*.md` note (for example `../Assets/Attachments/x.png`).
#[tauri::command]
pub fn vault_import_files_into_attachments(
    state: State<'_, VaultRootState>,
    sources: Vec<String>,
) -> Result<Vec<String>, String> {
    let vault_root = {
        let vault = state.0.lock().map_err(|e| e.to_string())?;
        let Some(root) = vault.as_ref() else {
            return Err("no vault session; pick a folder first".into());
        };
        root.clone()
    };
    let dest_dir = vault_attachments_dir(&vault_root);
    assert_in_vault(Some(&vault_root), &dest_dir)?;
    fs::create_dir_all(&dest_dir).map_err(|e| e.to_string())?;

    let mut out = Vec::new();
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| e.to_string())?
        .as_millis();

    for (i, src_str) in sources.into_iter().enumerate() {
        let src = PathBuf::from(src_str.trim());
        let meta = fs::metadata(&src).map_err(|e| e.to_string())?;
        if !meta.is_file() {
            return Err(format!("not a file: {}", src.display()));
        }
        let Some(ext) = image_ext_from_path(&src) else {
            return Err(format!(
                "unsupported image type (extension): {}",
                src.display()
            ));
        };
        validate_source_image_file(&src, &ext)?;
        let stem =
            sanitize_attachment_stem(src.file_name().and_then(|n| n.to_str()).unwrap_or("image"));
        let mut n: u32 = 0;
        loop {
            let dest_name = if n == 0 {
                format!("{stem}-{ts}-{i}.{ext}")
            } else {
                format!("{stem}-{ts}-{i}-{n}.{ext}")
            };
            let dest_path = dest_dir.join(&dest_name);
            if dest_path.exists() {
                n = n.saturating_add(1);
                continue;
            }
            fs::copy(&src, &dest_path).map_err(|e| e.to_string())?;
            out.push(format!("{MARKDOWN_REL_ATTACHMENTS_PREFIX}/{dest_name}"));
            break;
        }
    }

    Ok(out)
}

#[tauri::command]
pub fn vault_remove_file(state: State<'_, VaultRootState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    fs::remove_file(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_remove_tree(state: State<'_, VaultRootState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    let meta = fs::metadata(&target).map_err(|e| e.to_string())?;
    if !meta.is_dir() {
        return Err("path is not a directory".into());
    }
    fs::remove_dir_all(&target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_rename_file(
    state: State<'_, VaultRootState>,
    from_path: String,
    to_path: String,
) -> Result<(), String> {
    let from_target = PathBuf::from(from_path);
    let to_target = PathBuf::from(to_path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &from_target)?;
    assert_in_vault(vault.as_ref(), &to_target)?;
    fs::rename(&from_target, &to_target).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn vault_list_dir(
    state: State<'_, VaultRootState>,
    path: String,
) -> Result<Vec<VaultDirEntryDto>, String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    let read_dir = fs::read_dir(&target).map_err(|e| e.to_string())?;
    let mut rows = Vec::new();
    for entry in read_dir {
        let entry = entry.map_err(|e| e.to_string())?;
        let meta = entry.metadata().map_err(|e| e.to_string())?;
        let file_type = meta.file_type();
        let last_modified = meta
            .modified()
            .ok()
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_millis() as u64);
        let name = entry.file_name().to_string_lossy().to_string();
        let full_path = entry.path();
        rows.push(VaultDirEntryDto {
            uri: full_path.to_string_lossy().to_string(),
            name,
            last_modified,
            entry_type: if file_type.is_dir() {
                "directory".into()
            } else {
                "file".into()
            },
        });
    }
    Ok(rows)
}
