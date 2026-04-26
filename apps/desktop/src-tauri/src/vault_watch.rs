use std::collections::HashSet;
use std::sync::Mutex;
use std::time::{Duration, Instant};

use notify::{Config, Event, PollWatcher, RecommendedWatcher, RecursiveMode, Watcher};
use serde::Serialize;
use tauri::{App, AppHandle, Emitter, Manager, State};

use crate::vault::VaultRootState;

const WATCH_DEBOUNCE_MS: u64 = 200;
const WATCH_MAX_BATCH_MS: u64 = 900;
const WATCH_POLL_INTERVAL_MS: u64 = 750;
const WATCH_POLL_COMPARE_CONTENTS: bool = false;

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

struct VaultWatchers {
    _recommended: RecommendedWatcher,
    _poll: PollWatcher,
}

pub struct VaultWatchState {
    watchers: Mutex<Option<VaultWatchers>>,
    notify_tx: std::sync::mpsc::Sender<VaultWatchSignal>,
}

pub fn setup_vault_watch(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::channel();
    spawn_vault_debouncer(app.handle().clone(), rx);
    app.manage(VaultWatchState {
        watchers: Mutex::new(None),
        notify_tx: tx,
    });
    Ok(())
}

fn send_notify_event(
    tx: &std::sync::mpsc::Sender<VaultWatchSignal>,
    backend: &'static str,
    res: Result<Event, notify::Error>,
) {
    match res {
        Ok(ev) => {
            let batch: Vec<String> = ev
                .paths
                .iter()
                .map(|p| p.to_string_lossy().into_owned())
                .collect();
            if batch.is_empty() {
                let _ = tx.send(VaultWatchSignal::Coarse(format!(
                    "notify_event_empty_paths:{backend}"
                )));
            } else {
                let _ = tx.send(VaultWatchSignal::Paths(batch));
            }
        }
        Err(err) => {
            eprintln!("[vault-watch] {backend} watcher error: {err}");
            let _ = tx.send(VaultWatchSignal::Coarse(format!(
                "notify_error:{backend}:{err}"
            )));
        }
    }
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

fn collect_debounced_payload(
    rx: &std::sync::mpsc::Receiver<VaultWatchSignal>,
    first_signal: VaultWatchSignal,
    debounce_ms: u64,
    max_batch_ms: u64,
) -> Option<VaultFilesChangedPayload> {
    let mut acc: HashSet<String> = HashSet::new();
    let mut coarse_reason: Option<String> = None;
    let started_at = Instant::now();
    apply_watch_signal(first_signal, &mut acc, &mut coarse_reason);
    loop {
        let elapsed = started_at.elapsed();
        let max_batch = Duration::from_millis(max_batch_ms);
        if elapsed >= max_batch {
            break;
        }
        let remaining = max_batch - elapsed;
        let wait = std::cmp::min(Duration::from_millis(debounce_ms), remaining);
        match rx.recv_timeout(wait) {
            Ok(more) => apply_watch_signal(more, &mut acc, &mut coarse_reason),
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => return None,
        }
    }
    let paths: Vec<String> = acc.into_iter().collect();
    let coarse = coarse_reason.is_some();
    Some(VaultFilesChangedPayload {
        paths,
        coarse,
        coarse_reason,
    })
}

fn spawn_vault_debouncer(app_handle: AppHandle, rx: std::sync::mpsc::Receiver<VaultWatchSignal>) {
    std::thread::spawn(move || {
        while let Ok(first_signal) = rx.recv() {
            let Some(payload) =
                collect_debounced_payload(&rx, first_signal, WATCH_DEBOUNCE_MS, WATCH_MAX_BATCH_MS)
            else {
                return;
            };
            let _ = app_handle.emit("vault-files-changed", payload);
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
        let mut guard = watch_state.watchers.lock().map_err(|e| e.to_string())?;
        *guard = None;
    }

    let tx_recommended = watch_state.notify_tx.clone();
    let mut recommended = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            send_notify_event(&tx_recommended, "recommended", res);
        },
        Config::default(),
    )
    .map_err(|e| format!("recommended watcher: {e}"))?;

    let tx_poll = watch_state.notify_tx.clone();
    // Keep the poll fallback stat-based. `compare_contents=true` would recursively
    // read and hash every file in the vault on every poll, including attachments.
    let poll_config = Config::default()
        .with_poll_interval(Duration::from_millis(WATCH_POLL_INTERVAL_MS))
        .with_compare_contents(WATCH_POLL_COMPARE_CONTENTS);
    let mut poll = PollWatcher::new(
        move |res: Result<Event, notify::Error>| {
            send_notify_event(&tx_poll, "poll", res);
        },
        poll_config,
    )
    .map_err(|e| format!("poll watcher: {e}"))?;

    if root.exists() {
        recommended
            .watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("recommended watch {}: {e}", root.display()))?;
        poll.watch(&root, RecursiveMode::Recursive)
            .map_err(|e| format!("poll watch {}: {e}", root.display()))?;
    } else {
        let _ = watch_state.notify_tx.send(VaultWatchSignal::Coarse(
            "vault_root_missing_at_watch_start".to_string(),
        ));
    }

    let mut guard = watch_state.watchers.lock().map_err(|e| e.to_string())?;
    *guard = Some(VaultWatchers {
        _recommended: recommended,
        _poll: poll,
    });
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn collect_debounced_payload_marks_coarse_when_any_coarse_signal_arrives() {
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(VaultWatchSignal::Paths(vec![
            "/vault/Inbox/A.md".to_string()
        ]))
        .expect("send path signal");
        tx.send(VaultWatchSignal::Coarse(
            "notify_error:recommended:overflow".to_string(),
        ))
        .expect("send coarse signal");

        let payload = collect_debounced_payload(
            &rx,
            VaultWatchSignal::Paths(vec!["/vault/Inbox/B.md".to_string()]),
            10,
            50,
        )
        .expect("payload");
        assert!(payload.coarse);
        assert_eq!(
            payload.coarse_reason.as_deref(),
            Some("notify_error:recommended:overflow")
        );
        assert!(payload.paths.contains(&"/vault/Inbox/A.md".to_string()));
        assert!(payload.paths.contains(&"/vault/Inbox/B.md".to_string()));
    }

    #[test]
    fn collect_debounced_payload_deduplicates_paths_from_dual_backends() {
        let (tx, rx) = std::sync::mpsc::channel();
        tx.send(VaultWatchSignal::Paths(vec![
            "/vault/Inbox/A.md".to_string(),
            "/vault/Inbox/B.md".to_string(),
        ]))
        .expect("send poll paths");

        let payload = collect_debounced_payload(
            &rx,
            VaultWatchSignal::Paths(vec![
                "/vault/Inbox/A.md".to_string(),
                "/vault/Inbox/B.md".to_string(),
            ]),
            10,
            50,
        )
        .expect("payload");
        assert!(!payload.coarse);
        assert_eq!(payload.paths.len(), 2);
        assert!(payload.paths.contains(&"/vault/Inbox/A.md".to_string()));
        assert!(payload.paths.contains(&"/vault/Inbox/B.md".to_string()));
    }

    #[test]
    fn collect_debounced_payload_respects_max_batch_duration_for_continuous_stream() {
        let (tx, rx) = std::sync::mpsc::channel();
        std::thread::spawn(move || {
            for i in 0..200 {
                let _ = tx.send(VaultWatchSignal::Paths(vec![format!(
                    "/vault/Inbox/{i}.md"
                )]));
                std::thread::sleep(Duration::from_millis(2));
            }
        });

        let started = Instant::now();
        let payload = collect_debounced_payload(
            &rx,
            VaultWatchSignal::Paths(vec!["/vault/Inbox/first.md".to_string()]),
            20,
            80,
        )
        .expect("payload");
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_millis(220),
            "elapsed={elapsed:?} should stay bounded by max batch duration"
        );
        assert!(payload.paths.contains(&"/vault/Inbox/first.md".to_string()));
    }
}
