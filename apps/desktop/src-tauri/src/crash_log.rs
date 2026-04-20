//! Append-only crash log on disk so we always have a stack trace locally, even when Sentry is
//! unavailable (no DSN, offline, init failed). Written as one JSON object per line.

use std::io::Write;

use tauri::{AppHandle, Manager};

const CRASH_LOG_FILE: &str = "crash.log";
const CRASH_LOG_ROTATED_FILE: &str = "crash.log.1";
/// Keep the file small enough that users can paste it into an issue; rotate once we pass this.
const MAX_BYTES: u64 = 512 * 1024;

#[tauri::command]
pub fn eskerra_append_crash_log(
    app: AppHandle,
    record: serde_json::Value,
) -> Result<String, String> {
    let dir = app.path().app_log_dir().map_err(|e| e.to_string())?;
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join(CRASH_LOG_FILE);

    if let Ok(meta) = std::fs::metadata(&path) {
        if meta.len() >= MAX_BYTES {
            let rotated = dir.join(CRASH_LOG_ROTATED_FILE);
            let _ = std::fs::rename(&path, &rotated);
        }
    }

    let line = serde_json::to_string(&record).map_err(|e| e.to_string())?;
    let mut file = std::fs::OpenOptions::new()
        .create(true)
        .append(true)
        .open(&path)
        .map_err(|e| e.to_string())?;
    writeln!(file, "{line}").map_err(|e| e.to_string())?;

    Ok(path.to_string_lossy().into_owned())
}
