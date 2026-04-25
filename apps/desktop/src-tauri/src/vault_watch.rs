use std::collections::HashSet;
use std::sync::Mutex;
use std::time::Duration;

use notify::{Config, Event, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State};

use crate::vault::VaultRootState;

const WATCH_DEBOUNCE_MS: u64 = 200;
const WATCH_POLL_INTERVAL_MS: u64 = 500;

#[derive(Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct VaultFilesChangedPayload {
    /// Absolute filesystem paths touched in this debounced batch (files and directories).
    pub paths: Vec<String>,
    /// When true, the frontend must treat this as full-vault invalidation (ignore `paths` precision).
    pub coarse: bool,
    /// Best-effort coarse invalidation reason for diagnostics.
    pub coarse_reason: Option<String>,
}

enum VaultWatchSignal {
    Paths(Vec<String>),
    Coarse(String),
}

pub struct VaultWatchState {
    watcher: Mutex<Option<RecommendedWatcher>>,
    poll_watcher: Mutex<Option<PollWatcher>>,
    notify_tx: std::sync::mpsc::Sender<VaultWatchSignal>,
}

pub fn setup_vault_watch(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::channel();
    spawn_vault_debouncer(app.handle().clone(), rx);
    app.manage(VaultWatchState {
        watcher: Mutex::new(None),
        poll_watcher: Mutex::new(None),
        notify_tx: tx,
    });
    Ok(())
}

fn apply_watch_signal(
    signal: VaultWatchSignal,
    acc: &mut HashSet<String>,
    coarse_reason: &mut Option<String>,
) {
    match signal {
        VaultWatchSignal::Paths(paths) => {
            acc.extend(paths);
        }
        VaultWatchSignal::Coarse(reason) => {
            if coarse_reason.is_none() {
                *coarse_reason = Some(reason);
            }
        }
    }
}

fn spawn_vault_debouncer(app_handle: AppHandle, rx: std::sync::mpsc::Receiver<VaultWatchSignal>) {
    std::thread::spawn(move || {
        while let Ok(first_signal) = rx.recv() {
            let mut acc: HashSet<String> = HashSet::new();
            let mut coarse_reason: Option<String> = None;
            apply_watch_signal(first_signal, &mut acc, &mut coarse_reason);
            while let Ok(more) = rx.recv_timeout(Duration::from_millis(WATCH_DEBOUNCE_MS)) {
                apply_watch_signal(more, &mut acc, &mut coarse_reason);
            }
            let paths: Vec<String> = acc.into_iter().collect();
            let coarse = coarse_reason.is_some();
            let _ = app_handle.emit(
                "vault-files-changed",
                VaultFilesChangedPayload {
                    paths,
                    coarse,
                    coarse_reason,
                },
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
    let root = vault
        .as_ref()
        .ok_or_else(|| "no vault session; pick a folder first".to_string())?;
    let root = root.clone();
    drop(vault);

    {
        let mut guard = watch_state.watcher.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }
    {
        let mut guard = watch_state.poll_watcher.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let tx_recommended = watch_state.notify_tx.clone();
    let mut watcher = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(ev) => {
                let batch: Vec<String> = ev
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if batch.is_empty() {
                    let _ = tx_recommended.send(VaultWatchSignal::Coarse(
                        "notify_event_empty_paths:recommended".to_string(),
                    ));
                } else {
                    let _ = tx_recommended.send(VaultWatchSignal::Paths(batch));
                }
            }
            Err(err) => {
                eprintln!("[vault-watch] recommended watcher error: {err}");
                let _ = tx_recommended.send(VaultWatchSignal::Coarse(format!(
                    "notify_error:recommended:{err}"
                )));
            }
        },
        Config::default(),
    )
    .map_err(|e| e.to_string())?;

    let tx_poll = watch_state.notify_tx.clone();
    let poll_config = Config::default()
        .with_compare_contents(true)
        .with_poll_interval(Duration::from_millis(WATCH_POLL_INTERVAL_MS));
    let mut poll_watcher = PollWatcher::new(
        move |res: Result<Event, notify::Error>| match res {
            Ok(ev) => {
                let batch: Vec<String> = ev
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().into_owned())
                    .collect();
                if batch.is_empty() {
                    let _ = tx_poll.send(VaultWatchSignal::Coarse(
                        "notify_event_empty_paths:poll".to_string(),
                    ));
                } else {
                    let _ = tx_poll.send(VaultWatchSignal::Paths(batch));
                }
            }
            Err(err) => {
                eprintln!("[vault-watch] poll watcher error: {err}");
                let _ = tx_poll.send(VaultWatchSignal::Coarse(format!("notify_error:poll:{err}")));
            }
        },
        poll_config,
    )
    .map_err(|e| e.to_string())?;

    if root.exists() {
        watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("watch {}: {e}", root.display()))?;
        poll_watcher
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("poll watch {}: {e}", root.display()))?;
    } else {
        let _ = watch_state.notify_tx.send(VaultWatchSignal::Coarse(
            "vault_root_missing_at_watch_start".to_string(),
        ));
    }

    let mut guard = watch_state.watcher.lock().map_err(|e| e.to_string())?;
    *guard = Some(watcher);
    drop(guard);

    let mut poll_guard = watch_state.poll_watcher.lock().map_err(|e| e.to_string())?;
    *poll_guard = Some(poll_watcher);
    Ok(())
}
