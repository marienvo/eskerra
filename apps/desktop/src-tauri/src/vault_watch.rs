use std::collections::HashSet;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, Mutex};
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
    Paths { session_id: u64, paths: Vec<String> },
    Coarse { session_id: u64, reason: String },
}

struct VaultWatchers {
    _recommended: RecommendedWatcher,
    _poll: PollWatcher,
}

pub struct VaultWatchState {
    watchers: Mutex<Option<VaultWatchers>>,
    notify_tx: std::sync::mpsc::Sender<VaultWatchSignal>,
    active_session_id: Arc<AtomicU64>,
}

pub fn setup_vault_watch(app: &mut App) -> Result<(), Box<dyn std::error::Error>> {
    let (tx, rx) = std::sync::mpsc::channel();
    let active_session_id = Arc::new(AtomicU64::new(0));
    spawn_vault_debouncer(app.handle().clone(), rx, Arc::clone(&active_session_id));
    app.manage(VaultWatchState {
        watchers: Mutex::new(None),
        notify_tx: tx,
        active_session_id,
    });
    Ok(())
}

fn send_notify_event(
    tx: &std::sync::mpsc::Sender<VaultWatchSignal>,
    session_id: u64,
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
                let _ = tx.send(VaultWatchSignal::Coarse {
                    session_id,
                    reason: format!("notify_event_empty_paths:{backend}"),
                });
            } else {
                let _ = tx.send(VaultWatchSignal::Paths {
                    session_id,
                    paths: batch,
                });
            }
        }
        Err(err) => {
            eprintln!("[vault-watch] {backend} watcher error: {err}");
            let _ = tx.send(VaultWatchSignal::Coarse {
                session_id,
                reason: format!("notify_error:{backend}:{err}"),
            });
        }
    }
}

fn signal_session_id(signal: &VaultWatchSignal) -> u64 {
    match signal {
        VaultWatchSignal::Paths { session_id, .. }
        | VaultWatchSignal::Coarse { session_id, .. } => *session_id,
    }
}

fn apply_watch_signal(
    signal: VaultWatchSignal,
    acc: &mut HashSet<String>,
    coarse_reason: &mut Option<String>,
) {
    match signal {
        VaultWatchSignal::Paths { paths, .. } => {
            acc.extend(paths);
        }
        VaultWatchSignal::Coarse { reason, .. } => {
            if coarse_reason.is_none() {
                *coarse_reason = Some(reason);
            }
        }
    }
}

enum DebouncedPayloadResult {
    Payload(VaultFilesChangedPayload),
    DropStale,
    Disconnected,
}

fn collect_debounced_payload(
    rx: &std::sync::mpsc::Receiver<VaultWatchSignal>,
    first_signal: VaultWatchSignal,
    active_session_id: &AtomicU64,
    debounce_ms: u64,
    max_batch_ms: u64,
) -> DebouncedPayloadResult {
    let mut session_id = signal_session_id(&first_signal);
    if session_id != active_session_id.load(Ordering::Acquire) {
        return DebouncedPayloadResult::DropStale;
    }
    let mut acc: HashSet<String> = HashSet::new();
    let mut coarse_reason: Option<String> = None;
    let mut started_at = Instant::now();
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
            Ok(more) => {
                let more_session_id = signal_session_id(&more);
                if more_session_id == session_id {
                    apply_watch_signal(more, &mut acc, &mut coarse_reason);
                } else if more_session_id == active_session_id.load(Ordering::Acquire) {
                    session_id = more_session_id;
                    acc.clear();
                    coarse_reason = None;
                    started_at = Instant::now();
                    apply_watch_signal(more, &mut acc, &mut coarse_reason);
                }
            }
            Err(std::sync::mpsc::RecvTimeoutError::Timeout) => break,
            Err(std::sync::mpsc::RecvTimeoutError::Disconnected) => {
                return DebouncedPayloadResult::Disconnected;
            }
        }
    }
    if session_id != active_session_id.load(Ordering::Acquire) {
        return DebouncedPayloadResult::DropStale;
    }
    let paths: Vec<String> = acc.into_iter().collect();
    let coarse = coarse_reason.is_some();
    DebouncedPayloadResult::Payload(VaultFilesChangedPayload {
        paths,
        coarse,
        coarse_reason,
    })
}

fn spawn_vault_debouncer(
    app_handle: AppHandle,
    rx: std::sync::mpsc::Receiver<VaultWatchSignal>,
    active_session_id: Arc<AtomicU64>,
) {
    std::thread::spawn(move || {
        while let Ok(first_signal) = rx.recv() {
            match collect_debounced_payload(
                &rx,
                first_signal,
                &active_session_id,
                WATCH_DEBOUNCE_MS,
                WATCH_MAX_BATCH_MS,
            ) {
                DebouncedPayloadResult::Payload(payload) => {
                    let _ = app_handle.emit("vault-files-changed", payload);
                }
                DebouncedPayloadResult::DropStale => {}
                DebouncedPayloadResult::Disconnected => return,
            }
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
    let session_id = watch_state.active_session_id.fetch_add(1, Ordering::AcqRel) + 1;

    let tx_recommended = watch_state.notify_tx.clone();
    let mut recommended = RecommendedWatcher::new(
        move |res: Result<Event, notify::Error>| {
            send_notify_event(&tx_recommended, session_id, "recommended", res);
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
            send_notify_event(&tx_poll, session_id, "poll", res);
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
        let _ = watch_state.notify_tx.send(VaultWatchSignal::Coarse {
            session_id,
            reason: "vault_root_missing_at_watch_start".to_string(),
        });
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

    fn active_session(id: u64) -> AtomicU64 {
        AtomicU64::new(id)
    }

    fn paths(session_id: u64, paths: Vec<&str>) -> VaultWatchSignal {
        VaultWatchSignal::Paths {
            session_id,
            paths: paths.into_iter().map(str::to_string).collect(),
        }
    }

    fn coarse(session_id: u64, reason: &str) -> VaultWatchSignal {
        VaultWatchSignal::Coarse {
            session_id,
            reason: reason.to_string(),
        }
    }

    fn payload(result: DebouncedPayloadResult) -> VaultFilesChangedPayload {
        match result {
            DebouncedPayloadResult::Payload(payload) => payload,
            DebouncedPayloadResult::DropStale => panic!("payload was stale"),
            DebouncedPayloadResult::Disconnected => panic!("channel disconnected"),
        }
    }

    #[test]
    fn collect_debounced_payload_marks_coarse_when_any_coarse_signal_arrives() {
        let (tx, rx) = std::sync::mpsc::channel();
        let active = active_session(1);
        tx.send(paths(1, vec!["/vault/Inbox/A.md"]))
            .expect("send path signal");
        tx.send(coarse(1, "notify_error:recommended:overflow"))
            .expect("send coarse signal");

        let payload = payload(collect_debounced_payload(
            &rx,
            paths(1, vec!["/vault/Inbox/B.md"]),
            &active,
            10,
            50,
        ));
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
        let active = active_session(1);
        tx.send(paths(1, vec!["/vault/Inbox/A.md", "/vault/Inbox/B.md"]))
            .expect("send poll paths");

        let payload = payload(collect_debounced_payload(
            &rx,
            paths(1, vec!["/vault/Inbox/A.md", "/vault/Inbox/B.md"]),
            &active,
            10,
            50,
        ));
        assert!(!payload.coarse);
        assert_eq!(payload.paths.len(), 2);
        assert!(payload.paths.contains(&"/vault/Inbox/A.md".to_string()));
        assert!(payload.paths.contains(&"/vault/Inbox/B.md".to_string()));
    }

    #[test]
    fn collect_debounced_payload_drops_stale_session_signal() {
        let (_tx, rx) = std::sync::mpsc::channel();
        let active = active_session(2);

        let result = collect_debounced_payload(
            &rx,
            paths(1, vec!["/old-vault/Inbox/A.md"]),
            &active,
            10,
            50,
        );

        assert!(matches!(result, DebouncedPayloadResult::DropStale));
    }

    #[test]
    fn collect_debounced_payload_switches_to_new_active_session_mid_batch() {
        let (tx, rx) = std::sync::mpsc::channel();
        let _hold_tx_open = tx.clone();
        let active = Arc::new(active_session(1));
        let active_for_thread = Arc::clone(&active);
        std::thread::spawn(move || {
            std::thread::sleep(Duration::from_millis(5));
            active_for_thread.store(2, Ordering::Release);
            tx.send(paths(2, vec!["/new-vault/Inbox/New.md"]))
                .expect("send new-session paths");
        });

        let payload = payload(collect_debounced_payload(
            &rx,
            paths(1, vec!["/old-vault/Inbox/Old.md"]),
            &active,
            10,
            50,
        ));

        assert_eq!(payload.paths, vec!["/new-vault/Inbox/New.md".to_string()]);
    }

    #[test]
    fn collect_debounced_payload_respects_max_batch_duration_for_continuous_stream() {
        let (tx, rx) = std::sync::mpsc::channel();
        let active = active_session(1);
        std::thread::spawn(move || {
            for i in 0..200 {
                let _ = tx.send(VaultWatchSignal::Paths {
                    session_id: 1,
                    paths: vec![format!("/vault/Inbox/{i}.md")],
                });
                std::thread::sleep(Duration::from_millis(2));
            }
        });

        let started = Instant::now();
        let payload = payload(collect_debounced_payload(
            &rx,
            paths(1, vec!["/vault/Inbox/first.md"]),
            &active,
            20,
            80,
        ));
        let elapsed = started.elapsed();
        assert!(
            elapsed < Duration::from_millis(220),
            "elapsed={elapsed:?} should stay bounded by max batch duration"
        );
        assert!(payload.paths.contains(&"/vault/Inbox/first.md".to_string()));
    }
}
