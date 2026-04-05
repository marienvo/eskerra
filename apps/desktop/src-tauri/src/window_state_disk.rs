//! Read persisted `main` window bounds from `.window-state.json` for restore fallback (same path as the window-state plugin default).

use tauri::{AppHandle, Manager};

const WINDOW_STATE_FILE: &str = ".window-state.json";

#[tauri::command]
pub fn eskerra_peek_window_state_file(app: AppHandle) -> Result<serde_json::Value, String> {
    let dir = app.path().app_config_dir().map_err(|e| e.to_string())?;
    let path = dir.join(WINDOW_STATE_FILE);
    if !path.exists() {
        return Ok(serde_json::json!({"pathExists": false}));
    }
    let raw = std::fs::read_to_string(&path).map_err(|e| e.to_string())?;
    let root: serde_json::Value = serde_json::from_str(&raw).map_err(|e| e.to_string())?;
    let main = root.get("main").cloned();
    let (main_width, main_height) = match main.as_ref() {
        Some(mv) => (
            mv.get("width").and_then(|v| v.as_u64()).map(|u| u as u32),
            mv.get("height").and_then(|v| v.as_u64()).map(|u| u as u32),
        ),
        None => (None, None),
    };
    Ok(serde_json::json!({
        "pathExists": true,
        "mainWidth": main_width,
        "mainHeight": main_height,
    }))
}
