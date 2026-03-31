//! GDK `WindowState` edge tiling (GTK3 / WebKitGTK). Used on Linux when the compositor reports
//! `LEFT_TILED` / `RIGHT_TILED` — the reliable signal on Wayland where `outer_position()` is often bogus.

use gdk::WindowState;
use gtk::prelude::*;
use tauri::WebviewWindow;
use webkit2gtk::WebView;

use crate::tiling_score::TilingState;

/// Best-effort mapping from GDK per-edge tiled flags. Returns `None` if inconclusive or GTK lookup fails.
pub fn gdk_edge_tiling_state(window: &WebviewWindow) -> Option<TilingState> {
    let (tx, rx) = std::sync::mpsc::sync_channel(1);
    let send_result = window.with_webview(move |platform| {
        let wv: WebView = platform.inner();
        let out = gdk_state_from_webview(&wv);
        let _ = tx.send(out);
    });
    if send_result.is_err() {
        return None;
    }
    rx.recv().ok().flatten()
}

fn gdk_state_from_webview(wv: &WebView) -> Option<TilingState> {
    let top = wv.toplevel()?;
    let gtk_win = top.downcast::<gtk::Window>().ok()?;
    let gdk_win = gtk_win.window()?;
    let s = gdk_win.state();
    let left = s.contains(WindowState::LEFT_TILED);
    let right = s.contains(WindowState::RIGHT_TILED);
    match (left, right) {
        (true, false) => Some(TilingState::Left),
        (false, true) => Some(TilingState::Right),
        _ => None,
    }
}
