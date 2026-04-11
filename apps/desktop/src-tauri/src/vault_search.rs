//! On-demand vault markdown content search (bounded pipeline: walker → deque → workers → aggregator).
//!
//! Eligibility rules must stay in lockstep with `packages/eskerra-core/src/vaultVisibility.ts`
//! and `vaultLayout.ts` (see unit tests and `specs/design/desktop-shell-patterns.md`).

use std::collections::VecDeque;
use std::fs;
use std::io;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::mpsc::{sync_channel, Receiver, RecvTimeoutError, SyncSender};
use std::sync::{Arc, Condvar, Mutex};
use std::thread;
use std::time::{Duration, Instant};

use serde::Serialize;
use tauri::{AppHandle, Emitter, State};

use crate::vault::VaultRootState;

/// Same marker as `SYNC_CONFLICT_MARKER` in `vaultLayout.ts`.
const SYNC_CONFLICT_MARKER: &str = "sync-conflict";
const MARKDOWN_EXTENSION: &str = ".md";
const MAX_FILE_BYTES: u64 = 524_288;
const MATCH_QUEUE_CAPACITY: usize = 256;
const FLUSH_INTERVAL_MS: u64 = 75;
const FLUSH_HIT_THRESHOLD: u32 = 35;
const SNIPPET_MAX_CHARS: usize = 160;
/// Sentinel `line_number` for a filename match hit (shown as "Filename" in the desktop UI).
const FILENAME_HIT_LINE_NUMBER: u32 = 0;
const DEFAULT_WORKER_COUNT: u32 = 5;
const MIN_WORKERS: u32 = 4;
const MAX_WORKERS: u32 = 8;

/// Tracks the in-flight search cancel flag so a new `vault_search_start` can preempt the previous run.
#[derive(Clone, Default)]
pub struct VaultSearchSessionState {
    cancel: Arc<Mutex<Option<Arc<AtomicBool>>>>,
}

fn arm_new_search_token(state: &VaultSearchSessionState) -> Arc<AtomicBool> {
    let mut g = state.cancel.lock().unwrap();
    if let Some(old) = g.take() {
        old.store(true, Ordering::Release);
    }
    let token = Arc::new(AtomicBool::new(false));
    *g = Some(token.clone());
    token
}

fn clear_token_if_current(state: &VaultSearchSessionState, token: &Arc<AtomicBool>) {
    let mut g = state.cancel.lock().unwrap();
    match g.as_ref() {
        Some(cur) if Arc::ptr_eq(cur, token) => {
            *g = None;
        }
        _ => {}
    }
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearchProgressDto {
    pub scanned_files: u32,
    pub total_hits: u32,
    pub skipped_large_files: u32,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum VaultFilenameMatchStrength {
    /// Full filename or stem equals the query (case-insensitive).
    Exact,
    /// Filename contains the query but is not an exact stem/full-name match.
    Partial,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearchHitDto {
    pub uri: String,
    #[serde(rename = "lineNumber")]
    pub line_number: u32,
    pub snippet: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filename_match: Option<VaultFilenameMatchStrength>,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearchUpdatePayload {
    pub search_id: String,
    pub hits: Vec<VaultSearchHitDto>,
    pub progress: VaultSearchProgressDto,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct VaultSearchDonePayload {
    pub search_id: String,
    pub cancelled: bool,
    pub progress: VaultSearchProgressDto,
}

#[derive(Clone)]
struct PathDeque {
    inner: Arc<(Mutex<PathDequeInner>, Condvar)>,
    capacity: usize,
}

struct PathDequeInner {
    deque: VecDeque<PathBuf>,
    walk_finished: bool,
}

impl PathDeque {
    fn new(capacity: usize) -> Self {
        Self {
            inner: Arc::new((
                Mutex::new(PathDequeInner {
                    deque: VecDeque::new(),
                    walk_finished: false,
                }),
                Condvar::new(),
            )),
            capacity,
        }
    }

    fn push(&self, path: PathBuf, cancel: &AtomicBool) {
        let (lock, cv) = &*self.inner;
        let mut g = lock.lock().unwrap();
        loop {
            if cancel.load(Ordering::Relaxed) || g.walk_finished {
                return;
            }
            if g.deque.len() < self.capacity {
                g.deque.push_back(path);
                cv.notify_all();
                return;
            }
            g = cv.wait(g).unwrap();
        }
    }

    fn finish_walk(&self) {
        let (lock, cv) = &*self.inner;
        let mut g = lock.lock().unwrap();
        g.walk_finished = true;
        cv.notify_all();
    }
}

enum PopResult {
    Path(PathBuf),
    Shutdown,
}

impl PathDeque {
    /// Workers block on an empty deque until paths arrive, `walk_finished`, or **cancel**.
    /// Cancel or finished walk returns `Shutdown` so `worker_loop` exits and drops its match sender—no infinite wait.
    fn pop(&self, cancel: &AtomicBool) -> PopResult {
        let (lock, cv) = &*self.inner;
        let mut g = lock.lock().unwrap();
        loop {
            if let Some(p) = g.deque.pop_front() {
                cv.notify_all();
                return PopResult::Path(p);
            }
            if g.walk_finished {
                return PopResult::Shutdown;
            }
            if cancel.load(Ordering::Relaxed) {
                return PopResult::Shutdown;
            }
            g = cv.wait(g).unwrap();
        }
    }
}

fn is_vault_tree_ignored_entry_name(name: &str) -> bool {
    name.starts_with('.') || name.starts_with('_')
}

fn is_vault_tree_hard_excluded_directory_name(name: &str) -> bool {
    matches!(
        name,
        "Assets" | "Excalidraw" | "Scripts" | "Templates"
    )
}

fn is_sync_conflict_file_name(name: &str) -> bool {
    name.to_lowercase().contains(SYNC_CONFLICT_MARKER)
}

fn is_eligible_vault_markdown_file_name(name: &str) -> bool {
    if !name.ends_with(MARKDOWN_EXTENSION) {
        return false;
    }
    if is_sync_conflict_file_name(name) {
        return false;
    }
    if is_vault_tree_ignored_entry_name(name) {
        return false;
    }
    true
}

fn walk_vault(
    dir: &Path,
    path_deque: &PathDeque,
    cancel: &AtomicBool,
) -> io::Result<()> {
    if cancel.load(Ordering::Relaxed) {
        return Ok(());
    }
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
            walk_vault(&path, path_deque, cancel)?;
        } else if file_type.is_file() && is_eligible_vault_markdown_file_name(&name_str) {
            path_deque.push(path, cancel);
        }
        if cancel.load(Ordering::Relaxed) {
            return Ok(());
        }
    }
    Ok(())
}

enum WorkerMsg {
    Hit(VaultSearchHitDto),
    FileScanned { skipped_large: bool },
}

fn trim_snippet(line: &str) -> String {
    line.trim().chars().take(SNIPPET_MAX_CHARS).collect()
}

fn classify_vault_note_filename_match(
    file_name: &str,
    stem: &str,
    query_lower: &str,
) -> Option<VaultFilenameMatchStrength> {
    if query_lower.is_empty() {
        return None;
    }
    let name_lower = file_name.to_lowercase();
    if !name_lower.contains(query_lower) {
        return None;
    }
    let stem_lower = stem.to_lowercase();
    if stem_lower == query_lower || name_lower == query_lower {
        return Some(VaultFilenameMatchStrength::Exact);
    }
    Some(VaultFilenameMatchStrength::Partial)
}

fn emit_filename_hit_if_needed(
    uri: &str,
    file_name_display: &str,
    strength: Option<VaultFilenameMatchStrength>,
    tx: &SyncSender<WorkerMsg>,
) {
    let Some(strength) = strength else {
        return;
    };
    let _ = tx.send(WorkerMsg::Hit(VaultSearchHitDto {
        uri: uri.to_string(),
        line_number: FILENAME_HIT_LINE_NUMBER,
        snippet: format!("Filename · {}", trim_snippet(file_name_display)),
        filename_match: Some(strength),
    }));
}

/// Absolute filesystem path for a note, same string class as `VaultDirEntryDto.uri` / `vault_list_dir`
/// and what `openMarkdownInEditor` / `selectNote` expect (same contract as `normalizeEditorDocUri` in TS).
/// Use `to_string_lossy` like listing; do not add `file://` or a trailing slash.
fn path_to_note_uri(path: &Path) -> String {
    path.to_string_lossy().to_string()
}

fn process_one_file(path: PathBuf, query_lower: &str, cancel: &AtomicBool, tx: &SyncSender<WorkerMsg>) {
    if cancel.load(Ordering::Relaxed) {
        let _ = tx.send(WorkerMsg::FileScanned {
            skipped_large: false,
        });
        return;
    }
    let meta = match fs::metadata(&path) {
        Ok(m) => m,
        Err(_) => {
            let _ = tx.send(WorkerMsg::FileScanned {
                skipped_large: false,
            });
            return;
        }
    };
    if !meta.is_file() {
        let _ = tx.send(WorkerMsg::FileScanned {
            skipped_large: false,
        });
        return;
    }
    let uri = path_to_note_uri(&path);
    let file_name_display = path
        .file_name()
        .map(|n| n.to_string_lossy().to_string())
        .unwrap_or_default();
    let stem_display = path
        .file_stem()
        .map(|s| s.to_string_lossy().to_string())
        .unwrap_or_default();
    let filename_strength =
        classify_vault_note_filename_match(&file_name_display, &stem_display, query_lower);

    let len = meta.len();
    if len > MAX_FILE_BYTES {
        emit_filename_hit_if_needed(&uri, &file_name_display, filename_strength, tx);
        let _ = tx.send(WorkerMsg::FileScanned {
            skipped_large: true,
        });
        return;
    }
    let bytes = match fs::read(&path) {
        Ok(b) => b,
        Err(_) => {
            let _ = tx.send(WorkerMsg::FileScanned {
                skipped_large: false,
            });
            return;
        }
    };
    let text = String::from_utf8_lossy(&bytes);
    emit_filename_hit_if_needed(&uri, &file_name_display, filename_strength, tx);

    let mut body_matches = 0u32;
    let mut line_number = 0u32;
    for line in text.lines() {
        if cancel.load(Ordering::Relaxed) {
            break;
        }
        line_number += 1;
        let line_lower = line.to_lowercase();
        if line_lower.contains(query_lower) {
            let hit = VaultSearchHitDto {
                uri: uri.clone(),
                line_number,
                snippet: trim_snippet(line),
                filename_match: None,
            };
            let _ = tx.send(WorkerMsg::Hit(hit));
            body_matches += 1;
            if body_matches >= 3 {
                break;
            }
        }
    }
    let _ = tx.send(WorkerMsg::FileScanned {
        skipped_large: false,
    });
}

/// Each iteration pops one path or stops: `PathDeque::pop` returns `Shutdown` when the walk ended,
/// the deque is drained, or **cancel** is set—workers never wait forever after cancellation.
fn worker_loop(
    path_deque: Arc<PathDeque>,
    match_tx: SyncSender<WorkerMsg>,
    cancel: Arc<AtomicBool>,
    query_lower: String,
) {
    loop {
        match path_deque.pop(cancel.as_ref()) {
            PopResult::Path(p) => process_one_file(p, &query_lower, cancel.as_ref(), &match_tx),
            PopResult::Shutdown => break,
        }
    }
}

fn run_aggregator(
    match_rx: Receiver<WorkerMsg>,
    app: AppHandle,
    search_id: String,
    cancel_flag: Arc<AtomicBool>,
) {
    let mut scanned_files = 0u32;
    let mut total_hits = 0u32;
    let mut skipped_large_files = 0u32;
    let mut pending_hits: Vec<VaultSearchHitDto> = Vec::new();
    let mut hits_since_flush = 0u32;
    let mut last_flush = Instant::now();

    let try_emit_flush = |pending: &mut Vec<VaultSearchHitDto>,
                          hits_since: &mut u32,
                          last: &mut Instant,
                          sf: u32,
                          th: u32,
                          sl: u32,
                          app: &AppHandle,
                          sid: &str,
                          cancel: &AtomicBool| {
        if cancel.load(Ordering::Relaxed) {
            return;
        }
        let elapsed = last.elapsed() >= Duration::from_millis(FLUSH_INTERVAL_MS);
        let hit_burst = *hits_since >= FLUSH_HIT_THRESHOLD;
        if !pending.is_empty() && (elapsed || hit_burst) {
            let hits = std::mem::take(pending);
            *hits_since = 0;
            *last = Instant::now();
            let _ = app.emit(
                "vault-search:update",
                VaultSearchUpdatePayload {
                    search_id: sid.to_string(),
                    hits,
                    progress: VaultSearchProgressDto {
                        scanned_files: sf,
                        total_hits: th,
                        skipped_large_files: sl,
                    },
                },
            );
            return;
        }
        if elapsed && pending.is_empty() {
            *last = Instant::now();
            let _ = app.emit(
                "vault-search:update",
                VaultSearchUpdatePayload {
                    search_id: sid.to_string(),
                    hits: vec![],
                    progress: VaultSearchProgressDto {
                        scanned_files: sf,
                        total_hits: th,
                        skipped_large_files: sl,
                    },
                },
            );
        }
    };

    loop {
        match match_rx.recv_timeout(Duration::from_millis(25)) {
            Ok(msg) => match msg {
                WorkerMsg::Hit(h) => {
                    pending_hits.push(h);
                    total_hits += 1;
                    hits_since_flush += 1;
                }
                WorkerMsg::FileScanned { skipped_large } => {
                    scanned_files += 1;
                    if skipped_large {
                        skipped_large_files += 1;
                    }
                }
            },
            Err(RecvTimeoutError::Timeout) => {
                try_emit_flush(
                    &mut pending_hits,
                    &mut hits_since_flush,
                    &mut last_flush,
                    scanned_files,
                    total_hits,
                    skipped_large_files,
                    &app,
                    &search_id,
                    cancel_flag.as_ref(),
                );
            }
            Err(RecvTimeoutError::Disconnected) => break,
        }
        try_emit_flush(
            &mut pending_hits,
            &mut hits_since_flush,
            &mut last_flush,
            scanned_files,
            total_hits,
            skipped_large_files,
            &app,
            &search_id,
            cancel_flag.as_ref(),
        );
    }

    while let Ok(msg) = match_rx.recv() {
        match msg {
            WorkerMsg::Hit(h) => {
                pending_hits.push(h);
                total_hits += 1;
            }
            WorkerMsg::FileScanned { skipped_large } => {
                scanned_files += 1;
                if skipped_large {
                    skipped_large_files += 1;
                }
            }
        }
    }

    if !cancel_flag.load(Ordering::Relaxed) && !pending_hits.is_empty() {
        let _ = app.emit(
            "vault-search:update",
            VaultSearchUpdatePayload {
                search_id: search_id.clone(),
                hits: std::mem::take(&mut pending_hits),
                progress: VaultSearchProgressDto {
                    scanned_files,
                    total_hits,
                    skipped_large_files,
                },
            },
        );
    }

    let cancelled = cancel_flag.load(Ordering::Relaxed);
    let _ = app.emit(
        "vault-search:done",
        VaultSearchDonePayload {
            search_id: search_id.clone(),
            cancelled,
            progress: VaultSearchProgressDto {
                scanned_files,
                total_hits,
                skipped_large_files,
            },
        },
    );
}

fn path_queue_capacity(worker_count: usize) -> usize {
    (worker_count * 8).min(256)
}

fn run_search_pipeline(
    app: AppHandle,
    vault_root: PathBuf,
    search_id: String,
    query_lower: String,
    worker_count: usize,
    cancel: Arc<AtomicBool>,
    session: VaultSearchSessionState,
) {
    let path_cap = path_queue_capacity(worker_count);
    let path_deque = Arc::new(PathDeque::new(path_cap));
    let (match_tx, match_rx) = sync_channel::<WorkerMsg>(MATCH_QUEUE_CAPACITY);

    let agg_cancel = cancel.clone();
    let agg_app = app.clone();
    let agg_sid = search_id.clone();
    let aggregator = thread::spawn(move || {
        run_aggregator(match_rx, agg_app, agg_sid, agg_cancel);
    });

    let mut worker_handles = Vec::new();
    for _ in 0..worker_count {
        let pd = path_deque.clone();
        let tx = match_tx.clone();
        let c = cancel.clone();
        let q = query_lower.clone();
        worker_handles.push(thread::spawn(move || worker_loop(pd, tx, c, q)));
    }

    let _ = walk_vault(&vault_root, path_deque.as_ref(), cancel.as_ref());
    path_deque.finish_walk();

    for h in worker_handles {
        let _ = h.join();
    }
    drop(match_tx);

    let _ = aggregator.join();

    clear_token_if_current(&session, &cancel);
}

#[tauri::command]
pub fn vault_search_start(
    app: AppHandle,
    vault_state: State<'_, VaultRootState>,
    session: State<'_, VaultSearchSessionState>,
    search_id: String,
    query: String,
    worker_count: Option<u32>,
) -> Result<(), String> {
    let vault_root = vault_state
        .0
        .lock()
        .map_err(|e| e.to_string())?
        .clone()
        .ok_or_else(|| "no vault session; pick a folder first".to_string())?;

    let query_trim = query.trim();
    if query_trim.is_empty() {
        let _ = app.emit(
            "vault-search:done",
            VaultSearchDonePayload {
                search_id,
                cancelled: false,
                progress: VaultSearchProgressDto {
                    scanned_files: 0,
                    total_hits: 0,
                    skipped_large_files: 0,
                },
            },
        );
        return Ok(());
    }

    let wc = worker_count.unwrap_or(DEFAULT_WORKER_COUNT).clamp(MIN_WORKERS, MAX_WORKERS) as usize;
    let token = arm_new_search_token(&session);
    let query_lower = query_trim.to_lowercase();
    let session_for_thread = (*session).clone();
    let app2 = app.clone();
    let sid = search_id.clone();
    thread::spawn(move || {
        run_search_pipeline(
            app2,
            vault_root,
            sid,
            query_lower,
            wc,
            token,
            session_for_thread,
        );
    });

    Ok(())
}

#[tauri::command]
pub fn vault_search_cancel(session: State<'_, VaultSearchSessionState>) -> Result<(), String> {
    let mut g = session
        .cancel
        .lock()
        .unwrap_or_else(|e| e.into_inner());
    if let Some(tok) = g.take() {
        tok.store(true, Ordering::Release);
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;

    #[test]
    fn eligibility_matches_vault_visibility_rules() {
        assert!(is_eligible_vault_markdown_file_name("Note.md"));
        assert!(!is_eligible_vault_markdown_file_name("Note.txt"));
        assert!(!is_eligible_vault_markdown_file_name(".Note.md"));
        assert!(!is_eligible_vault_markdown_file_name("_Note.md"));
        assert!(!is_eligible_vault_markdown_file_name(
            "Note sync-conflict-abc.md"
        ));
    }

    #[test]
    fn walk_skips_hidden_and_assets_tree() {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::write(tmp.path().join("ok.md"), "").unwrap();
        std::fs::write(tmp.path().join(".hide.md"), "").unwrap();
        std::fs::create_dir_all(tmp.path().join("Assets")).unwrap();
        std::fs::write(tmp.path().join("Assets/nope.md"), "").unwrap();
        let deque = PathDeque::new(64);
        let cancel = AtomicBool::new(false);
        walk_vault(tmp.path(), &deque, &cancel).unwrap();
        deque.finish_walk();
        let mut paths = Vec::new();
        loop {
            match deque.pop(&cancel) {
                PopResult::Path(p) => paths.push(p),
                PopResult::Shutdown => break,
            }
        }
        assert_eq!(paths.len(), 1);
        assert!(paths[0].ends_with("ok.md"));
    }

    #[test]
    fn oversized_file_skipped_without_reading_full_content() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("big.md");
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(&vec![b'a'; (MAX_FILE_BYTES as usize) + 1]).unwrap();
        drop(f);
        let (tx, rx) = sync_channel::<WorkerMsg>(4);
        let cancel = AtomicBool::new(false);
        process_one_file(p, "a", &cancel, &tx);
        drop(tx);
        let mut skipped = false;
        let mut scanned = false;
        while let Ok(m) = rx.recv() {
            match m {
                WorkerMsg::FileScanned { skipped_large } => {
                    scanned = true;
                    if skipped_large {
                        skipped = true;
                    }
                }
                WorkerMsg::Hit(_) => panic!("unexpected hit"),
            }
        }
        assert!(scanned);
        assert!(skipped);
    }

    #[test]
    fn trim_snippet_max_length() {
        let long: String = (0..300).map(|_| 'β').collect();
        let out = trim_snippet(&format!("  {long}  "));
        assert_eq!(out.chars().count(), SNIPPET_MAX_CHARS);
    }

    #[test]
    fn classify_vault_note_filename_match_strength() {
        use VaultFilenameMatchStrength::{Exact, Partial};

        assert_eq!(
            classify_vault_note_filename_match("Foo Bar.md", "Foo Bar", "foo"),
            Some(Partial)
        );
        assert_eq!(
            classify_vault_note_filename_match("Foo Bar.md", "Foo Bar", "foo bar"),
            Some(Exact)
        );
        assert_eq!(
            classify_vault_note_filename_match("Foo Bar.md", "Foo Bar", "baz"),
            None
        );
        assert_eq!(
            classify_vault_note_filename_match("Report.md", "Report", "report"),
            Some(Exact)
        );
        assert_eq!(
            classify_vault_note_filename_match("Report.md", "Report", "report.md"),
            Some(Exact)
        );
    }

    #[test]
    fn filename_match_emits_hit_without_body_match() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("Quarterly Report.md");
        std::fs::write(&p, "Hello world.\nNothing relevant.\n").unwrap();
        let (tx, rx) = sync_channel::<WorkerMsg>(8);
        let cancel = AtomicBool::new(false);
        process_one_file(p, "report", &cancel, &tx);
        drop(tx);
        let mut hits = Vec::new();
        let mut scanned = false;
        let mut skipped_large = false;
        while let Ok(m) = rx.recv() {
            match m {
                WorkerMsg::Hit(h) => hits.push(h),
                WorkerMsg::FileScanned { skipped_large: s } => {
                    scanned = true;
                    skipped_large = s;
                }
            }
        }
        assert!(scanned);
        assert!(!skipped_large);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line_number, FILENAME_HIT_LINE_NUMBER);
        assert_eq!(
            hits[0].filename_match,
            Some(VaultFilenameMatchStrength::Partial)
        );
        assert!(hits[0].snippet.to_lowercase().contains("report"));
    }

    #[test]
    fn filename_exact_match_emits_exact_strength() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("Standup Notes.md");
        std::fs::write(&p, "Unrelated body.\n").unwrap();
        let (tx, rx) = sync_channel::<WorkerMsg>(8);
        let cancel = AtomicBool::new(false);
        process_one_file(p, "standup notes", &cancel, &tx);
        drop(tx);
        let mut hits = Vec::new();
        while let Ok(m) = rx.recv() {
            if let WorkerMsg::Hit(h) = m {
                hits.push(h);
            }
        }
        assert_eq!(hits.len(), 1);
        assert_eq!(
            hits[0].filename_match,
            Some(VaultFilenameMatchStrength::Exact)
        );
    }

    #[test]
    fn oversized_file_emits_filename_hit_when_name_matches() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("Target Huge.md");
        let mut f = std::fs::File::create(&p).unwrap();
        f.write_all(&vec![b'x'; (MAX_FILE_BYTES as usize) + 1]).unwrap();
        drop(f);
        let (tx, rx) = sync_channel::<WorkerMsg>(8);
        let cancel = AtomicBool::new(false);
        process_one_file(p, "target", &cancel, &tx);
        drop(tx);
        let mut hits = Vec::new();
        let mut skipped = false;
        while let Ok(m) = rx.recv() {
            match m {
                WorkerMsg::Hit(h) => hits.push(h),
                WorkerMsg::FileScanned { skipped_large } => {
                    if skipped_large {
                        skipped = true;
                    }
                }
            }
        }
        assert!(skipped);
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].line_number, FILENAME_HIT_LINE_NUMBER);
        assert_eq!(
            hits[0].filename_match,
            Some(VaultFilenameMatchStrength::Partial)
        );
    }
}
