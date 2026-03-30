use std::sync::Mutex;
use std::time::Duration;

use notify::{Config, Event, RecommendedWatcher, RecursiveMode, Watcher};
use tauri::{App, AppHandle, Emitter, Manager, State};

use crate::vault::VaultRootState;

pub struct VaultWatchState {
    pub watcher: Mutex<Option<RecommendedWatcher>>,
    pub notify_tx: std::sync::mpsc::Sender<()>,
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

fn spawn_vault_debouncer(app_handle: AppHandle, rx: std::sync::mpsc::Receiver<()>) {
    std::thread::spawn(move || {
        while let Ok(()) = rx.recv() {
            while let Ok(()) = rx.recv_timeout(Duration::from_millis(400)) {
                // Drain rapid events; quiet period ends the inner loop.
            }
            let _ = app_handle.emit("vault-files-changed", ());
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
            if res.is_ok() {
                let _ = tx.send(());
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    for sub in ["Inbox", "General", ".notebox"] {
        let p = root.join(sub);
        if p.exists() {
            watcher
                .watch(&p, RecursiveMode::Recursive)
                .map_err(|e| format!("watch {}: {e}", p.display()))?;
        }
    }

    let mut guard = watch_state.watcher.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    Ok(())
}
