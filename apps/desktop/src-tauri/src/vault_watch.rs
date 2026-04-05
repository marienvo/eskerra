use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State};

use crate::vault::VaultRootState;

#[derive(Clone, Serialize)]
pub struct VaultFilesChangedPayload {
    /// Absolute filesystem paths touched in this debounced batch (files and directories).
    pub paths: Vec<String>,
}

pub struct VaultWatchState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub notify_tx: std::sync::mpsc::Sender<Vec<String>>,
}

pub fn setup_vault_watch(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::channel();
    spawn_vault_debouncer(app.handle().clone(), rx);
    app.manage(VaultWatchState {
        watcher: Mutex::new(None),
        notify_tx: tx,
    });
    Ok(())
}

fn spawn_vault_debouncer(
    app_handle: AppHandle,
    rx: std::sync::mpsc::Receiver<Vec<String>>,
) {
    std::thread::spawn(move || {
        while let Ok(first_batch) = rx.recv() {
            let mut acc: HashSet<String> = first_batch.into_iter().collect();
            while let Ok(more) = rx.recv_timeout(Duration::from_millis(400)) {
                acc.extend(more);
            }
            let paths: Vec<String> = acc.into_iter().collect();
            let _ = app_handle.emit(
                "vault-files-changed",
                VaultFilesChangedPayload { paths },
            );
        }
    });
}

#[tauri::command]
pub fn vault_start_watch(
    vault_state: State<'_, VaultRootState>,
    watch_state: State<'_, VaultWatchState>,
) -> Result<(), String> {
    let vault = vault_state.0.lock().map_err(|e| e.to_string())?;
    let root = vault.as_ref().ok_or_else(|| "no vault session; pick a folder first".to_string())?;
    let root = root.clone();
    drop(vault);

    {
        let mut guard = watch_state.watcher.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let tx = watch_state.notify_tx.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            if let Ok(ev) = res {
                let batch: Vec<String> = ev
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if !batch.is_empty() {
                    let _ = tx.send(batch);
                }
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    if root.exists() {
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("watch {}: {e}", root.display()))?;
    }

    let mut guard = watch_state.watcher.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}
