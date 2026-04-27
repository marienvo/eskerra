//! Vault-wide YAML frontmatter index for enum-style autocomplete (top-level keys only).
//! Eligibility for `.md` files matches [`crate::vault_search`].

use std::collections::{HashMap, HashSet};
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::{Arc, LazyLock, Mutex};
use std::thread;

use regex::Regex;
use serde::Serialize;
use serde_yaml::Value as YamlVal;
use tauri::{AppHandle, Emitter, State};

use crate::vault::VaultRootState;
use crate::vault_search::{
    is_eligible_vault_markdown_file_name, is_vault_tree_hard_excluded_directory_name,
    is_vault_tree_ignored_entry_name, MAX_FILE_BYTES,
};

#[derive(Clone, Debug)]
enum FileKeyContrib {
    Scalar(serde_json::Value),
    ListItems(Vec<String>),
    ObjectFlag,
}

#[derive(Clone, Debug)]
struct FileSnapshot {
    uri: String,
    keys: HashMap<String, FileKeyContrib>,
}

#[derive(Default, Clone)]
struct KeyAgg {
    /** Notes (files) that expose this key with a scalar or list value shape. */
    note_count: usize,
    scalars: HashMap<String, usize>,
    list_items: HashMap<String, usize>,
    /** Notes whose value for this key is a nested mapping (not scalar sequence). */
    object_notes: usize,
}

#[derive(Default)]
struct FrontmatterIndexInner {
    vault_root: Option<PathBuf>,
    files: HashMap<String, FileSnapshot>,
    keys: HashMap<String, KeyAgg>,
    skipped_duplicate_key_files: usize,
}

#[derive(Clone)]
pub struct VaultFrontmatterIndexState {
    inner: Arc<Mutex<FrontmatterIndexInner>>,
}

impl Default for VaultFrontmatterIndexState {
    fn default() -> Self {
        Self {
            inner: Arc::new(Mutex::new(FrontmatterIndexInner::default())),
        }
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultFrontmatterIndexSnapshotDto {
    pub keys: Vec<VaultFrontmatterKeyRowDto>,
    pub skipped_duplicate_key_files: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultFrontmatterKeyRowDto {
    pub key: String,
    pub inferred_type: String,
    pub total_notes: usize,
    pub top_values: Vec<VaultFrontmatterValueCountDto>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultFrontmatterValueCountDto {
    pub value_json: serde_json::Value,
    pub count: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultFrontmatterValuesForKeyDto {
    pub entries: Vec<VaultFrontmatterValueCountDto>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultFrontmatterIndexReadyPayload {
    pub skipped_duplicate_key_files: usize,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultFrontmatterIndexUpdatedPayload {
    pub changed_keys: Vec<String>,
}

static RE_TOP_UNQUOTED: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^([a-zA-Z_][a-zA-Z0-9_]*)\s*:").unwrap());
static RE_TOP_DQ: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r#"^"([^"\\]*(?:\\.[^"\\]*)*)"\s*:"#).unwrap());
static RE_TOP_SQ: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^'([^'\\]*(?:\\.[^'\\]*)*)'\s*:").unwrap());
static RE_DATE: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"^\d{4}-\d{2}-\d{2}$").unwrap());
static RE_DATETIME: LazyLock<Regex> =
    LazyLock::new(|| Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$").unwrap());
static RE_TS: LazyLock<Regex> = LazyLock::new(|| {
    Regex::new(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d+)?(Z|[+-]\d{2}:\d{2})$").unwrap()
});
static RE_HTTP_URL: LazyLock<Regex> = LazyLock::new(|| Regex::new(r"(?i)^https?://").unwrap());

fn split_frontmatter_inner(markdown: &str) -> Option<String> {
    let normalized = markdown.replace("\r\n", "\n");
    let lines: Vec<&str> = normalized.split('\n').collect();

    let mut i = 0usize;
    while i < lines.len() && lines[i].trim().is_empty() {
        i += 1;
    }
    if lines.get(i).map(|l| l.trim()) != Some("---") {
        return None;
    }
    let open = i + 1;
    let mut j = open;
    while j < lines.len() && lines[j].trim() != "---" {
        j += 1;
    }
    if j >= lines.len() {
        return None;
    }
    Some(lines[open..j].join("\n"))
}

fn extract_top_level_key(line: &str) -> Option<String> {
    if let Some(c) = RE_TOP_UNQUOTED.captures(line) {
        return Some(c[1].to_string());
    }
    if let Some(c) = RE_TOP_DQ.captures(line) {
        return Some(c[1].replace("\\\"", "\"").replace("\\\\", "\\"));
    }
    if let Some(c) = RE_TOP_SQ.captures(line) {
        return Some(c[1].replace("\\'", "'").replace("\\\\", "\\"));
    }
    None
}

fn scan_duplicate_top_level_keys(inner: &str) -> Vec<String> {
    let normalized = inner.replace("\r\n", "\n");
    let mut counts: HashMap<String, usize> = HashMap::new();
    for line in normalized.split('\n') {
        if line.starts_with(char::is_whitespace) {
            continue;
        }
        let trimmed_end = line.trim_end();
        if trimmed_end.is_empty() || trimmed_end.starts_with('#') {
            continue;
        }
        if let Some(key) = extract_top_level_key(line) {
            *counts.entry(key).or_insert(0) += 1;
        }
    }
    let mut dups: Vec<String> = counts
        .into_iter()
        .filter(|(_, c)| *c > 1)
        .map(|(k, _)| k)
        .collect();
    dups.sort();
    dups
}

fn yaml_to_json_scalar(y: &YamlVal) -> Option<serde_json::Value> {
    match y {
        YamlVal::Null => Some(serde_json::Value::Null),
        YamlVal::Bool(b) => Some(serde_json::Value::Bool(*b)),
        YamlVal::Number(n) => {
            if let Some(i) = n.as_i64() {
                return Some(serde_json::Number::from(i).into());
            }
            if let Some(u) = n.as_u64() {
                return Some(serde_json::Number::from(u).into());
            }
            n.as_f64()
                .and_then(|f| serde_json::Number::from_f64(f).map(Into::into))
        }
        YamlVal::String(s) => Some(serde_json::Value::String(s.clone())),
        YamlVal::Sequence(_) | YamlVal::Mapping(_) => None,
        YamlVal::Tagged(t) => yaml_to_json_scalar(&t.value),
    }
}

fn sj_key(v: &serde_json::Value) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| v.to_string())
}

fn contribution_from_yaml_value(val: &YamlVal) -> Option<FileKeyContrib> {
    match val {
        YamlVal::Mapping(m) => {
            if m.is_empty() {
                Some(FileKeyContrib::ObjectFlag)
            } else {
                Some(FileKeyContrib::ObjectFlag)
            }
        }
        YamlVal::Sequence(seq) => {
            if seq.is_empty() {
                return Some(FileKeyContrib::ListItems(vec![]));
            }
            let mut items = Vec::new();
            let mut all_scalar = true;
            for item in seq {
                if let Some(j) = yaml_to_json_scalar(item) {
                    items.push(sj_key(&j));
                } else {
                    all_scalar = false;
                    break;
                }
            }
            if all_scalar {
                Some(FileKeyContrib::ListItems(items))
            } else {
                Some(FileKeyContrib::ObjectFlag)
            }
        }
        _ => yaml_to_json_scalar(val).map(FileKeyContrib::Scalar),
    }
}

fn add_contribution(agg: &mut KeyAgg, contrib: &FileKeyContrib) {
    match contrib {
        FileKeyContrib::Scalar(json) => {
            let sj = serde_json::to_string(json).unwrap_or_default();
            *agg.scalars.entry(sj).or_insert(0) += 1;
            agg.note_count += 1;
        }
        FileKeyContrib::ListItems(items) => {
            for it in items {
                *agg.list_items.entry(it.clone()).or_insert(0) += 1;
            }
            agg.note_count += 1;
        }
        FileKeyContrib::ObjectFlag => {
            agg.object_notes += 1;
            agg.note_count += 1;
        }
    }
}

fn subtract_contribution(agg: &mut KeyAgg, contrib: &FileKeyContrib) {
    match contrib {
        FileKeyContrib::Scalar(json) => {
            let sj = serde_json::to_string(json).unwrap_or_default();
            if let Some(n) = agg.scalars.get_mut(&sj) {
                *n = n.saturating_sub(1);
                if *n == 0 {
                    agg.scalars.remove(&sj);
                }
            }
            agg.note_count = agg.note_count.saturating_sub(1);
        }
        FileKeyContrib::ListItems(items) => {
            for it in items {
                if let Some(n) = agg.list_items.get_mut(it) {
                    *n = n.saturating_sub(1);
                    if *n == 0 {
                        agg.list_items.remove(it);
                    }
                }
            }
            agg.note_count = agg.note_count.saturating_sub(1);
        }
        FileKeyContrib::ObjectFlag => {
            agg.object_notes = agg.object_notes.saturating_sub(1);
            agg.note_count = agg.note_count.saturating_sub(1);
        }
    }
}

fn remove_file_from_index(inner: &mut FrontmatterIndexInner, uri: &str) {
    let Some(snap) = inner.files.remove(uri) else {
        return;
    };
    for (key_name, c) in snap.keys {
        if let Some(agg) = inner.keys.get_mut(&key_name) {
            subtract_contribution(agg, &c);
            if agg.note_count == 0
                && agg.scalars.is_empty()
                && agg.list_items.is_empty()
                && agg.object_notes == 0
            {
                inner.keys.remove(&key_name);
            }
        }
    }
}

fn insert_file_into_index(inner: &mut FrontmatterIndexInner, snap: FileSnapshot) {
    let uri = snap.uri.clone();
    for (key_name, c) in &snap.keys {
        let agg = inner.keys.entry(key_name.clone()).or_default();
        add_contribution(agg, c);
    }
    inner.files.insert(uri, snap);
}

fn index_markdown_file(vault_root: &Path, path: &Path) -> Option<FileSnapshot> {
    let meta = fs::metadata(path).ok()?;
    if meta.len() > MAX_FILE_BYTES {
        return None;
    }
    let raw = fs::read_to_string(path).ok()?;
    let uri = path_to_uri(vault_root, path);
    let inner_yaml = split_frontmatter_inner(&raw)?;
    if !scan_duplicate_top_level_keys(&inner_yaml).is_empty() {
        return None;
    }

    let root: YamlVal = serde_yaml::from_str(&inner_yaml).ok()?;
    let mapping = root.as_mapping()?;

    let mut keys: HashMap<String, FileKeyContrib> = HashMap::new();
    for (k, v) in mapping.iter() {
        let key_name = k.as_str()?.to_string();
        if let Some(contrib) = contribution_from_yaml_value(v) {
            keys.insert(key_name, contrib);
        }
    }

    Some(FileSnapshot { uri, keys })
}

fn path_to_uri(vault_root: &Path, path: &Path) -> String {
    path.strip_prefix(vault_root)
        .unwrap_or(path)
        .to_string_lossy()
        .to_string()
}

fn walk_markdown_files(dir: &Path, out: &mut Vec<PathBuf>) -> io::Result<()> {
    for entry in fs::read_dir(dir)? {
        let entry = entry?;
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if is_vault_tree_ignored_entry_name(&name_str) {
            continue;
        }
        let path = entry.path();
        let file_type = entry.file_type()?;
        if file_type.is_dir() {
            if is_vault_tree_hard_excluded_directory_name(&name_str) {
                continue;
            }
            walk_markdown_files(&path, out)?;
        } else if file_type.is_file() && is_eligible_vault_markdown_file_name(&name_str) {
            out.push(path);
        }
    }
    Ok(())
}

#[derive(Hash, Eq, PartialEq)]
enum Tv {
    Text,
    Number,
    Checkbox,
    Date,
    Datetime,
    Timestamp,
    Url,
    List,
    Object,
}

fn classify_string_shape(s: &str) -> Tv {
    if RE_HTTP_URL.is_match(s) {
        return Tv::Url;
    }
    if RE_DATE.is_match(s) {
        return Tv::Date;
    }
    if RE_DATETIME.is_match(s) {
        return Tv::Datetime;
    }
    if RE_TS.is_match(s) {
        return Tv::Timestamp;
    }
    Tv::Text
}

fn classify_scalar_json(v: &serde_json::Value) -> Tv {
    match v {
        serde_json::Value::Bool(_) => Tv::Checkbox,
        serde_json::Value::Number(_) => Tv::Number,
        serde_json::Value::String(s) => classify_string_shape(s),
        _ => Tv::Text,
    }
}

fn infer_property_type(key_name: &str, agg: &KeyAgg) -> &'static str {
    let kl = key_name.to_lowercase();
    if kl == "tags" {
        return "tags";
    }
    if kl == "aliases" {
        return "list";
    }

    let total_weight = {
        let s: usize = agg.scalars.values().sum();
        let l: usize = agg.list_items.values().sum();
        s + l + agg.object_notes
    };

    let n_notes = agg.note_count;
    if n_notes < 3 {
        return "text";
    }

    let mut tally: HashMap<Tv, usize> = HashMap::new();

    for (js, cnt) in &agg.scalars {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(js) {
            *tally.entry(classify_scalar_json(&v)).or_insert(0) += cnt;
        }
    }
    for (_, cnt) in &agg.list_items {
        *tally.entry(Tv::List).or_insert(0) += cnt;
    }
    *tally.entry(Tv::Object).or_insert(0) += agg.object_notes;

    if total_weight == 0 {
        return "text";
    }

    let (best_ty, best_c) = tally
        .iter()
        .max_by_key(|(_, c)| *c)
        .map(|(t, c)| (t, *c))
        .unwrap();

    if best_c * 100 < total_weight * 70 {
        return "text";
    }

    match best_ty {
        Tv::Text => "text",
        Tv::Number => "number",
        Tv::Checkbox => "checkbox",
        Tv::Date => "date",
        Tv::Datetime => "datetime",
        Tv::Timestamp => "timestamp",
        Tv::Url => "url",
        Tv::List => "list",
        Tv::Object => "object",
    }
}

fn snapshot_key_row(key_name: &str, agg: &KeyAgg) -> VaultFrontmatterKeyRowDto {
    let inferred_type = infer_property_type(key_name, agg).to_string();
    let mut top: Vec<(serde_json::Value, usize)> = Vec::new();
    for (sj, cnt) in &agg.scalars {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(sj) {
            top.push((v, *cnt));
        }
    }
    for (s, cnt) in &agg.list_items {
        top.push((serde_json::Value::String(s.clone()), *cnt));
    }
    top.sort_by(|a, b| {
        b.1.cmp(&a.1)
            .then_with(|| format!("{}", a.0).cmp(&format!("{}", b.0)))
    });
    top.truncate(100);

    VaultFrontmatterKeyRowDto {
        key: key_name.to_string(),
        inferred_type,
        total_notes: agg.note_count,
        top_values: top
            .into_iter()
            .map(|(value_json, count)| VaultFrontmatterValueCountDto { value_json, count })
            .collect(),
    }
}

fn build_snapshot(inner: &FrontmatterIndexInner) -> VaultFrontmatterIndexSnapshotDto {
    let mut rows: Vec<VaultFrontmatterKeyRowDto> = inner
        .keys
        .iter()
        .map(|(k, agg)| snapshot_key_row(k, agg))
        .collect();
    rows.sort_by(|a, b| a.key.cmp(&b.key));
    VaultFrontmatterIndexSnapshotDto {
        keys: rows,
        skipped_duplicate_key_files: inner.skipped_duplicate_key_files,
    }
}

fn full_rebuild(app: AppHandle, vault_root: PathBuf, state: VaultFrontmatterIndexState) {
    thread::spawn(move || {
        let mut paths: Vec<PathBuf> = Vec::new();
        if vault_root.exists() {
            let _ = walk_markdown_files(&vault_root, &mut paths);
        }

        let mut inner = FrontmatterIndexInner::default();
        inner.vault_root = Some(vault_root.clone());

        let mut skipped = 0usize;
        for path in paths {
            let raw = match fs::read_to_string(&path) {
                Ok(r) => r,
                Err(_) => continue,
            };
            let Some(inner_yaml) = split_frontmatter_inner(&raw) else {
                continue;
            };
            if !scan_duplicate_top_level_keys(&inner_yaml).is_empty() {
                skipped += 1;
                continue;
            }
            if let Some(snap) = index_markdown_file(&vault_root, &path) {
                insert_file_into_index(&mut inner, snap);
            }
        }
        inner.skipped_duplicate_key_files = skipped;

        if let Ok(mut g) = state.inner.lock() {
            *g = inner;
        }

        let skipped_dup = state
            .inner
            .lock()
            .map(|i| i.skipped_duplicate_key_files)
            .unwrap_or(0);

        let _ = app.emit(
            "vault-frontmatter-index-ready",
            VaultFrontmatterIndexReadyPayload {
                skipped_duplicate_key_files: skipped_dup,
            },
        );
    });
}

fn touch_paths_best_effort(
    app: &AppHandle,
    vault_root: &Path,
    state: &VaultFrontmatterIndexState,
    paths: &[String],
) {
    let mut changed_keys: HashSet<String> = HashSet::new();
    let Ok(mut inner) = state.inner.lock() else {
        return;
    };

    for path_str in paths {
        let path = Path::new(path_str);
        if !path.starts_with(vault_root) {
            continue;
        }
        let uri = path_to_uri(vault_root, path);
        remove_file_from_index(&mut inner, &uri);

        let name = path.file_name().and_then(|s| s.to_str()).unwrap_or("");
        if !is_eligible_vault_markdown_file_name(name) {
            continue;
        }

        let Some(raw) = fs::read_to_string(path).ok() else {
            continue;
        };
        let Some(inner_yaml) = split_frontmatter_inner(&raw) else {
            continue;
        };
        if !scan_duplicate_top_level_keys(&inner_yaml).is_empty() {
            continue;
        }

        if let Some(snap) = index_markdown_file(vault_root, path) {
            for k in snap.keys.keys() {
                changed_keys.insert(k.clone());
            }
            insert_file_into_index(&mut inner, snap);
        }
    }

    drop(inner);

    let payload = VaultFrontmatterIndexUpdatedPayload {
        changed_keys: changed_keys.into_iter().collect(),
    };
    let _ = app.emit("vault-frontmatter-index-updated", payload);
}

#[tauri::command]
pub fn vault_frontmatter_index_schedule(
    app: AppHandle,
    vault_state: State<'_, VaultRootState>,
    fm_state: State<'_, VaultFrontmatterIndexState>,
) -> Result<(), String> {
    let vault_root = vault_state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no vault session".to_string())?;

    full_rebuild(app, vault_root, (*fm_state).clone());
    Ok(())
}

#[tauri::command]
pub fn vault_frontmatter_index_snapshot(
    fm_state: State<'_, VaultFrontmatterIndexState>,
) -> Result<VaultFrontmatterIndexSnapshotDto, String> {
    let inner = fm_state.inner.lock().map_err(|e| e.to_string())?;
    Ok(build_snapshot(&inner))
}

#[tauri::command]
pub fn vault_frontmatter_index_values_for_key(
    fm_state: State<'_, VaultFrontmatterIndexState>,
    key: String,
    prefix: String,
    limit: usize,
) -> Result<VaultFrontmatterValuesForKeyDto, String> {
    let inner = fm_state.inner.lock().map_err(|e| e.to_string())?;
    let agg = inner.keys.get(&key);
    let Some(agg) = agg else {
        return Ok(VaultFrontmatterValuesForKeyDto { entries: vec![] });
    };

    let pref = prefix.to_lowercase();
    let mut pairs: Vec<(serde_json::Value, usize)> = Vec::new();

    for (js, cnt) in &agg.scalars {
        if let Ok(v) = serde_json::from_str::<serde_json::Value>(js) {
            if json_prefix_ok(&v, &pref) {
                pairs.push((v, *cnt));
            }
        }
    }
    for (s, cnt) in &agg.list_items {
        let v = serde_json::Value::String(s.clone());
        if json_prefix_ok(&v, &pref) {
            pairs.push((v, *cnt));
        }
    }

    pairs.sort_by(|a, b| b.1.cmp(&a.1));
    pairs.truncate(limit.max(1).min(500));

    Ok(VaultFrontmatterValuesForKeyDto {
        entries: pairs
            .into_iter()
            .map(|(value_json, count)| VaultFrontmatterValueCountDto { value_json, count })
            .collect(),
    })
}

fn json_prefix_ok(v: &serde_json::Value, pref_lower: &str) -> bool {
    match v {
        serde_json::Value::String(s) => {
            if pref_lower.is_empty() {
                return true;
            }
            s.to_lowercase().starts_with(pref_lower)
        }
        serde_json::Value::Number(n) => {
            if pref_lower.is_empty() {
                return true;
            }
            n.to_string()
                .starts_with(pref_lower.trim_start_matches('-'))
        }
        serde_json::Value::Bool(_) | serde_json::Value::Null => pref_lower.is_empty(),
        _ => false,
    }
}

#[tauri::command]
pub fn vault_frontmatter_index_touch_paths(
    app: AppHandle,
    vault_state: State<'_, VaultRootState>,
    fm_state: State<'_, VaultFrontmatterIndexState>,
    paths: Vec<String>,
) -> Result<(), String> {
    let vault_root = vault_state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no vault session".to_string())?;

    touch_paths_best_effort(&app, &vault_root, &fm_state, &paths);
    Ok(())
}
