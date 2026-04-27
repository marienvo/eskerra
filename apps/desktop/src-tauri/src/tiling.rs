//! Window half-tiling snapshot via Tauri geometry APIs.
//!
//! **Linux / Wayland:** `outer_position()` is often `(0, 0)` or otherwise not meaningful for clients
//! (see upstream Tauri/winit discussions). We prefer **GDK `WindowState`** edge flags when available,
//! then fall back to geometry heuristics. On Wayland, unreliable outer position forces `None` before
//! fuzzy scoring so half-width floating windows are not mislabeled as tiled.

use tauri::{PhysicalPosition, PhysicalSize, WebviewWindow};

use crate::tiling_score::{
    score_tiling, GeometryAudit, HardGateGeometry, Rect, TilingConfig, TilingDetection,
};

#[cfg(target_os = "linux")]
use crate::tiling_gdk::gdk_edge_tiling_state;

fn tiling_debug_enabled() -> bool {
    std::env::var("ESKERRA_DEBUG_TILING")
        .map(|v| v == "1" || v.eq_ignore_ascii_case("true"))
        .unwrap_or(false)
}

fn rect_physical(pos: PhysicalPosition<i32>, size: PhysicalSize<u32>) -> Rect {
    Rect {
        x: pos.x as f64,
        y: pos.y as f64,
        w: size.width as f64,
        h: size.height as f64,
    }
}

fn phys_to_logical_rect(pos: PhysicalPosition<i32>, size: PhysicalSize<u32>, scale: f64) -> Rect {
    if scale <= f64::EPSILON {
        return Rect {
            x: pos.x as f64,
            y: pos.y as f64,
            w: size.width as f64,
            h: size.height as f64,
        };
    }
    Rect {
        x: pos.x as f64 / scale,
        y: pos.y as f64 / scale,
        w: size.width as f64 / scale,
        h: size.height as f64 / scale,
    }
}

#[cfg(target_os = "linux")]
fn linux_is_wayland_session() -> bool {
    std::env::var("XDG_SESSION_TYPE")
        .map(|v| v.eq_ignore_ascii_case("wayland"))
        .unwrap_or(false)
        || std::env::var("WAYLAND_DISPLAY")
            .map(|v| !v.is_empty())
            .unwrap_or(false)
}

/// When true, horizontal placement from `outer_position` should not be trusted for tiling heuristics.
#[cfg(target_os = "linux")]
fn wayland_outer_position_unreliable(
    session_is_wayland: bool,
    outer_px: PhysicalPosition<i32>,
    window_logical: &Rect,
    work_logical: &Rect,
) -> bool {
    if !session_is_wayland {
        return false;
    }
    if outer_px.x != 0 || outer_px.y != 0 {
        return false;
    }
    const SLACK: f64 = 8.0;
    let nearly_full_w = window_logical.w >= work_logical.w - SLACK;
    let nearly_full_h = window_logical.h >= work_logical.h - SLACK;
    if nearly_full_w && nearly_full_h {
        return false;
    }
    true
}

#[cfg(not(target_os = "linux"))]
fn wayland_outer_position_unreliable(
    _session_is_wayland: bool,
    _outer_px: PhysicalPosition<i32>,
    _window_logical: &Rect,
    _work_logical: &Rect,
) -> bool {
    false
}

#[cfg(not(target_os = "linux"))]
fn linux_is_wayland_session() -> bool {
    false
}

const GDK_TILING_CONFIDENCE: f64 = 0.95;

/// Returns half-tiling inference for the calling webview window.
#[tauri::command]
pub fn get_window_tiling_detection(window: WebviewWindow) -> TilingDetection {
    let debug_components = tiling_debug_enabled();
    let maximized = window.is_maximized().unwrap_or(false);
    if maximized {
        if debug_components {
            eprintln!("[eskerra tiling] maximized -> none");
        }
        return TilingDetection {
            state: crate::tiling_score::TilingState::None,
            confidence: 0.0,
            components: None,
        };
    }

    #[cfg(target_os = "linux")]
    if let Some(state) = gdk_edge_tiling_state(&window) {
        if debug_components {
            eprintln!(
                "[eskerra tiling] gdk edge state -> {state:?} conf={GDK_TILING_CONFIDENCE:.3}"
            );
        }
        return TilingDetection {
            state,
            confidence: GDK_TILING_CONFIDENCE,
            components: None,
        };
    }

    let scale_window = window.scale_factor().unwrap_or(1.0);
    let outer_pos = match window.outer_position() {
        Ok(p) => p,
        Err(e) => {
            if debug_components {
                eprintln!("[eskerra tiling] outer_position error: {e}");
            }
            return TilingDetection {
                state: crate::tiling_score::TilingState::None,
                confidence: 0.0,
                components: None,
            };
        }
    };
    let outer_size = match window.outer_size() {
        Ok(s) => s,
        Err(e) => {
            if debug_components {
                eprintln!("[eskerra tiling] outer_size error: {e}");
            }
            return TilingDetection {
                state: crate::tiling_score::TilingState::None,
                confidence: 0.0,
                components: None,
            };
        }
    };

    let window_physical = rect_physical(outer_pos, outer_size);

    let monitor = match window.current_monitor() {
        Ok(Some(m)) => m,
        Ok(None) => {
            if debug_components {
                eprintln!("[eskerra tiling] no current_monitor");
            }
            return TilingDetection {
                state: crate::tiling_score::TilingState::None,
                confidence: 0.0,
                components: None,
            };
        }
        Err(e) => {
            if debug_components {
                eprintln!("[eskerra tiling] current_monitor error: {e}");
            }
            return TilingDetection {
                state: crate::tiling_score::TilingState::None,
                confidence: 0.0,
                components: None,
            };
        }
    };

    let scale_mon = monitor.scale_factor();
    let wa = monitor.work_area();
    let work_physical = rect_physical(wa.position, wa.size);

    // Single reference scale for soft scoring and for logical audit (avoid window vs monitor mixed logical space).
    let window_outer = phys_to_logical_rect(outer_pos, outer_size, scale_mon);
    let work_area = phys_to_logical_rect(wa.position, wa.size, scale_mon);

    let session_wayland = linux_is_wayland_session();
    if wayland_outer_position_unreliable(session_wayland, outer_pos, &window_outer, &work_area) {
        if debug_components {
            eprintln!(
                "[eskerra tiling] wayland unreliable outer position (physical=({},{})) -> none",
                outer_pos.x, outer_pos.y
            );
        }
        return TilingDetection {
            state: crate::tiling_score::TilingState::None,
            confidence: 0.0,
            components: None,
        };
    }

    let audit = GeometryAudit {
        window_outer,
        work_area,
        is_maximized: false,
    };

    let gate_geom = HardGateGeometry::Physical {
        window: window_physical,
        work: work_physical,
        scale_ref: scale_mon,
    };

    let cfg = linux_tiling_config(session_wayland);
    let detection = score_tiling(&audit, &cfg, debug_components, debug_components, gate_geom);

    if debug_components {
        eprintln!(
            "[eskerra tiling] physical window=({:.1},{:.1}) {:.1}x{:.1} | work=({:.1},{:.1}) {:.1}x{:.1} | scale_window={:.2} scale_mon={:.2}",
            window_physical.x,
            window_physical.y,
            window_physical.w,
            window_physical.h,
            work_physical.x,
            work_physical.y,
            work_physical.w,
            work_physical.h,
            scale_window,
            scale_mon,
        );
        eprintln!(
            "[eskerra tiling] unified logical window=({:.1},{:.1}) {:.1}x{:.1} (scale_ref=mon {:.2}) | work=({:.1},{:.1}) {:.1}x{:.1} | state={:?} conf={:.3}",
            window_outer.x,
            window_outer.y,
            window_outer.w,
            window_outer.h,
            scale_mon,
            work_area.x,
            work_area.y,
            work_area.w,
            work_area.h,
            detection.state,
            detection.confidence,
        );
        if let Some(ref c) = detection.components {
            eprintln!("[eskerra tiling] components {c:?}");
        }
    }

    detection
}

fn linux_tiling_config(session_is_wayland: bool) -> TilingConfig {
    #[cfg(target_os = "linux")]
    {
        if session_is_wayland {
            // Fuzzy scoring only when GDK did not report edge flags; outer rect gates stay brittle.
            TilingConfig {
                edge_px: 10.0,
                require_hard_gates: false,
                c_min: 0.78,
                c_margin: 0.10,
                ..Default::default()
            }
        } else {
            // X11: outer position is meaningful — use hard snap gates with default thresholds.
            TilingConfig {
                edge_px: 10.0,
                require_hard_gates: true,
                ..Default::default()
            }
        }
    }
    #[cfg(not(target_os = "linux"))]
    {
        let _ = session_is_wayland;
        TilingConfig::default()
    }
}

#[cfg(all(test, target_os = "linux"))]
mod tests {
    use super::*;

    #[test]
    fn wayland_zero_outer_half_width_is_unreliable() {
        let work = Rect {
            x: 0.0,
            y: 27.0,
            w: 1920.0,
            h: 1053.0,
        };
        let win = Rect {
            x: 0.0,
            y: 27.0,
            w: 960.0,
            h: 1053.0,
        };
        assert!(wayland_outer_position_unreliable(
            true,
            PhysicalPosition::new(0, 0),
            &win,
            &work
        ));
    }

    #[test]
    fn wayland_zero_outer_near_full_size_not_unreliable() {
        let work = Rect {
            x: 0.0,
            y: 27.0,
            w: 1920.0,
            h: 1053.0,
        };
        let win = Rect {
            x: 0.0,
            y: 27.0,
            w: 1915.0,
            h: 1050.0,
        };
        assert!(!wayland_outer_position_unreliable(
            true,
            PhysicalPosition::new(0, 0),
            &win,
            &work
        ));
    }
}
