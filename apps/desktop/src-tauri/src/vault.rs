use std::fs;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::UNIX_EPOCH;

use serde::Serialize;
use tauri::State;

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
        return c.starts_with(v.as_ref())
            && (c.len() == v.len() || c[v.len()..].starts_with('/'));
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
    Ok(guard
        .as_ref()
        .map(|p| p.to_string_lossy().to_string()))
}

#[tauri::command]
pub fn vault_exists(
    state: State<'_, VaultRootState>,
    path: String,
) -> Result<bool, String> {
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
pub fn vault_read_file(
    state: State<'_, VaultRootState>,
    path: String,
) -> Result<String, String> {
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

#[tauri::command]
pub fn vault_remove_file(state: State<'_, VaultRootState>, path: String) -> Result<(), String> {
    let target = PathBuf::from(path);
    let vault = state.0.lock().map_err(|e| e.to_string())?;
    assert_in_vault(vault.as_ref(), &target)?;
    fs::remove_file(&target).map_err(|e| e.to_string())
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
