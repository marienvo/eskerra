//! Half-tile inference: window outer rect vs monitor work area.
//! Soft scores use **unified logical** px (single reference scale from the monitor).
//! Hard gates use **physical** px in production so window and work area are never mixed-scale.
//! Gate diagnostics: `ESKERRA_DEBUG_TILING=1` prints per-gate deltas to stderr.
//!
//! **Fallback (Option 3):** If physical gates still misclassify on a platform, revert to fuzzy-only:
//! drop the hard-gate branch in `score_tiling` and raise `c_min` / `c_margin` slightly to limit
//! false positives on rounded-corner styling.

use serde::Serialize;
use std::collections::HashMap;

/// Axis-aligned rectangle in logical pixels.
#[derive(Clone, Copy, Debug, PartialEq)]
pub struct Rect {
    pub x: f64,
    pub y: f64,
    pub w: f64,
    pub h: f64,
}

/// Inputs required by [`score_tiling`] after platform-specific collection.
#[derive(Clone, Copy, Debug)]
pub struct GeometryAudit {
    pub window_outer: Rect,
    pub work_area: Rect,
    pub is_maximized: bool,
}

/// Where hard gates read geometry from. Production uses [`HardGateGeometry::Physical`]; unit tests use [`HardGateGeometry::FromAuditLogical`].
#[derive(Clone, Copy, Debug)]
#[allow(dead_code)] // `FromAuditLogical` is only constructed from unit tests in this crate.
pub enum HardGateGeometry {
    /// Raw platform rectangles in **physical pixels**; tolerances scale with `scale_ref` (monitor `scale_factor`).
    Physical {
        window: Rect,
        work: Rect,
        scale_ref: f64,
    },
    /// Use `GeometryAudit` fields as **logical** px with tolerances as-is (scale 1 semantics).
    FromAuditLogical,
}

#[derive(Clone, Copy, Debug)]
pub struct TilingConfig {
    /// Edge snap tolerance (logical px), clamped in [`TilingConfig::sanitized`].
    pub edge_px: f64,
    pub c_min: f64,
    pub c_margin: f64,
    /// When `require_hard_gates` is false: if `|left_total - right_total|` is below this, treat as ambiguous and return [`TilingState::None`] (avoids arbitrary left wins on ties).
    pub fuzzy_tie_epsilon: f64,
    /// When false, classification uses only blended scores and [`TilingConfig::c_min`] / [`TilingConfig::c_margin`] (for platforms where hard gates misfire on outer geometry).
    pub require_hard_gates: bool,
    /// Relative width slack: `|ww - aw/2| / aw` must be at most this for full width score (penalty otherwise).
    pub r_width: f64,
    pub weight_vertical: f64,
    pub weight_width: f64,
    pub weight_edges: f64,
    pub weight_split: f64,
}

impl Default for TilingConfig {
    fn default() -> Self {
        Self {
            edge_px: 8.0,
            c_min: 0.72,
            c_margin: 0.06,
            fuzzy_tie_epsilon: 0.0015,
            require_hard_gates: true,
            r_width: 0.03,
            weight_vertical: 0.35,
            weight_width: 0.25,
            weight_edges: 0.30,
            weight_split: 0.10,
        }
    }
}

impl TilingConfig {
    pub fn sanitized(self) -> Self {
        let edge_px = self.edge_px.clamp(4.0, 16.0);
        let fuzzy_tie_epsilon = self.fuzzy_tie_epsilon.clamp(1.0e-6, 0.05);
        let mut w = self;
        w.edge_px = edge_px;
        w.fuzzy_tie_epsilon = fuzzy_tie_epsilon;
        let sum = w.weight_vertical + w.weight_width + w.weight_edges + w.weight_split;
        if sum > 0.0 {
            w.weight_vertical /= sum;
            w.weight_width /= sum;
            w.weight_edges /= sum;
            w.weight_split /= sum;
        }
        w
    }

    /// Top/bottom alignment to work area (logical px). Both must hold for hard gates.
    fn gate_tol_vertical(&self, aw: f64, ah: f64) -> f64 {
        (8.0_f64).max(0.012 * aw.min(ah))
    }

    /// `|window_w - work_w/2|` for hard gates (outer rect on Linux is often a few px off).
    fn gate_tol_half_width(&self, aw: f64) -> f64 {
        (16.0_f64).max(0.022 * aw)
    }

    /// Outer and inner snapped edges vs work area / vertical midline (logical px).
    fn gate_tol_snap_edge(&self, aw: f64) -> f64 {
        (12.0_f64).max(0.005 * aw)
    }

    fn t_dim(&self, aw: f64, ah: f64) -> f64 {
        (8.0_f64).max(0.012 * aw.min(ah))
    }

    fn t_half(&self, aw: f64) -> f64 {
        (12.0_f64).max(0.02 * aw)
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum TilingState {
    Left,
    Right,
    None,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TilingDetection {
    pub state: TilingState,
    pub confidence: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub components: Option<HashMap<String, f64>>,
}

fn gaussian_score(distance: f64, tol: f64) -> f64 {
    if tol <= f64::EPSILON {
        return 0.0;
    }
    let u = distance / tol;
    (-u * u).exp()
}

fn vertical_fill_score(wy: f64, wh: f64, ay: f64, ah: f64, t_dim: f64) -> f64 {
    let d_top = (wy - ay).abs();
    let d_bot = ((wy + wh) - (ay + ah)).abs();
    (gaussian_score(d_top, t_dim) + gaussian_score(d_bot, t_dim)) / 2.0
}

fn width_half_score(ww: f64, aw: f64, t_half: f64, r_width: f64) -> f64 {
    let target = aw / 2.0;
    let d_w = (ww - target).abs();
    let mut s = gaussian_score(d_w, t_half);
    if aw > f64::EPSILON && d_w / aw > r_width {
        s *= 0.5;
    }
    s
}

fn split_score(wx: f64, ww: f64, aw: f64, ax: f64, is_left: bool) -> f64 {
    let mid_win = wx + ww / 2.0;
    let expected = if is_left {
        ax + aw * 0.25
    } else {
        ax + aw * 0.75
    };
    gaussian_score((mid_win - expected).abs(), aw * 0.06)
}

fn edge_scores_left(wx: f64, ww: f64, ax: f64, _aw: f64, mid_x: f64, t_edge: f64) -> f64 {
    let d_l = (wx - ax).abs();
    let d_r = ((wx + ww) - mid_x).abs();
    (gaussian_score(d_l, t_edge) + gaussian_score(d_r, t_edge)) / 2.0
}

fn edge_scores_right(wx: f64, ww: f64, ax: f64, aw: f64, mid_x: f64, t_edge: f64) -> f64 {
    let d_l = (wx - mid_x).abs();
    let d_r = ((wx + ww) - (ax + aw)).abs();
    (gaussian_score(d_l, t_edge) + gaussian_score(d_r, t_edge)) / 2.0
}

struct HardGateEval {
    d_top: f64,
    d_bot: f64,
    d_wh_vs_ah: f64,
    d_half_w: f64,
    tol_v: f64,
    tol_w: f64,
    tol_e: f64,
    pass_top: bool,
    pass_bot: bool,
    pass_half_w: bool,
    pass_common: bool,
    left_d_outer: f64,
    left_d_mid: f64,
    left_pass_outer: bool,
    left_pass_mid: bool,
    left_ok: bool,
    right_d_mid: f64,
    right_d_outer: f64,
    right_pass_mid: bool,
    right_pass_outer: bool,
    right_ok: bool,
}

fn evaluate_hard_gates_inner(
    wx: f64,
    wy: f64,
    ww: f64,
    wh: f64,
    ax: f64,
    ay: f64,
    aw: f64,
    ah: f64,
    tol_v: f64,
    tol_w: f64,
    tol_e: f64,
) -> HardGateEval {
    let mid_x = ax + aw / 2.0;

    let d_top = (wy - ay).abs();
    let d_bot = ((wy + wh) - (ay + ah)).abs();
    let d_wh_vs_ah = (wh - ah).abs();
    let d_half_w = (ww - aw / 2.0).abs();

    let pass_top = d_top <= tol_v;
    let pass_bot = d_bot <= tol_v;
    let pass_half_w = d_half_w <= tol_w;
    let pass_common = pass_top && pass_bot && pass_half_w;

    let left_d_outer = (wx - ax).abs();
    let left_d_mid = ((wx + ww) - mid_x).abs();
    let left_pass_outer = left_d_outer <= tol_e;
    let left_pass_mid = left_d_mid <= tol_e;
    let left_ok = pass_common && left_pass_outer && left_pass_mid;

    let right_d_mid = (wx - mid_x).abs();
    let right_d_outer = ((wx + ww) - (ax + aw)).abs();
    let right_pass_mid = right_d_mid <= tol_e;
    let right_pass_outer = right_d_outer <= tol_e;
    let right_ok = pass_common && right_pass_mid && right_pass_outer;

    HardGateEval {
        d_top,
        d_bot,
        d_wh_vs_ah,
        d_half_w,
        tol_v,
        tol_w,
        tol_e,
        pass_top,
        pass_bot,
        pass_half_w,
        pass_common,
        left_d_outer,
        left_d_mid,
        left_pass_outer,
        left_pass_mid,
        left_ok,
        right_d_mid,
        right_d_outer,
        right_pass_mid,
        right_pass_outer,
        right_ok,
    }
}

/// Hard gates in **logical** px (unit tests).
fn evaluate_hard_gates_logical(audit: &GeometryAudit, cfg: &TilingConfig) -> HardGateEval {
    let Rect {
        x: wx,
        y: wy,
        w: ww,
        h: wh,
    } = audit.window_outer;
    let Rect {
        x: ax,
        y: ay,
        w: aw,
        h: ah,
    } = audit.work_area;
    let tol_v = cfg.gate_tol_vertical(aw, ah);
    let tol_w = cfg.gate_tol_half_width(aw);
    let tol_e = cfg.gate_tol_snap_edge(aw);
    evaluate_hard_gates_inner(wx, wy, ww, wh, ax, ay, aw, ah, tol_v, tol_w, tol_e)
}

/// Hard gates in **physical** px; tolerance formulas use work size in logical px = phys / scale_ref.
fn evaluate_hard_gates_physical(
    window: Rect,
    work: Rect,
    cfg: &TilingConfig,
    scale_ref: f64,
) -> HardGateEval {
    let scale = scale_ref.max(f64::EPSILON);
    let Rect {
        x: wx,
        y: wy,
        w: ww,
        h: wh,
    } = window;
    let Rect {
        x: ax,
        y: ay,
        w: aw,
        h: ah,
    } = work;
    let aw_log = aw / scale;
    let ah_log = ah / scale;
    let tol_v = cfg.gate_tol_vertical(aw_log, ah_log) * scale;
    let tol_w = cfg.gate_tol_half_width(aw_log) * scale;
    let tol_e = cfg.gate_tol_snap_edge(aw_log) * scale;
    evaluate_hard_gates_inner(wx, wy, ww, wh, ax, ay, aw, ah, tol_v, tol_w, tol_e)
}

fn evaluate_hard_gates_dispatch(
    audit: &GeometryAudit,
    cfg: &TilingConfig,
    gate_geom: HardGateGeometry,
) -> HardGateEval {
    match gate_geom {
        HardGateGeometry::FromAuditLogical => evaluate_hard_gates_logical(audit, cfg),
        HardGateGeometry::Physical {
            window,
            work,
            scale_ref,
        } => evaluate_hard_gates_physical(window, work, cfg, scale_ref),
    }
}

fn eprintln_hard_gates(g: &HardGateEval, space: &str) {
    eprintln!(
        "[eskerra tiling gates] space={} common d_top={:.3} tol_v={:.3} pass={} | d_bot={:.3} tol_v={:.3} pass={} | d_wh_vs_ah={:.3} (diag only, not gated) | d_half_w={:.3} tol_w={:.3} pass={} | common_ok={}",
        space,
        g.d_top,
        g.tol_v,
        g.pass_top,
        g.d_bot,
        g.tol_v,
        g.pass_bot,
        g.d_wh_vs_ah,
        g.d_half_w,
        g.tol_w,
        g.pass_half_w,
        g.pass_common
    );
    eprintln!(
        "[eskerra tiling gates] space={} left d_wx_ax={:.3} tol_e={:.3} pass={} | d_inner_mid={:.3} tol_e={:.3} pass={} | left_ok={}",
        space,
        g.left_d_outer,
        g.tol_e,
        g.left_pass_outer,
        g.left_d_mid,
        g.tol_e,
        g.left_pass_mid,
        g.left_ok
    );
    eprintln!(
        "[eskerra tiling gates] space={} right d_wx_mid={:.3} tol_e={:.3} pass={} | d_wxww_axaw={:.3} tol_e={:.3} pass={} | right_ok={}",
        space,
        g.right_d_mid,
        g.tol_e,
        g.right_pass_mid,
        g.right_d_outer,
        g.tol_e,
        g.right_pass_outer,
        g.right_ok
    );
}

fn score_side(
    audit: &GeometryAudit,
    cfg: &TilingConfig,
    is_left: bool,
    components: &mut HashMap<String, f64>,
) -> f64 {
    let Rect {
        x: wx,
        y: wy,
        w: ww,
        h: wh,
    } = audit.window_outer;
    let Rect {
        x: ax,
        y: ay,
        w: aw,
        h: ah,
    } = audit.work_area;
    let mid_x = ax + aw / 2.0;
    let t_dim = cfg.t_dim(aw, ah);
    let t_half = cfg.t_half(aw);
    let t_edge = cfg.edge_px;

    let s_v = vertical_fill_score(wy, wh, ay, ah, t_dim);
    let s_w = width_half_score(ww, aw, t_half, cfg.r_width);
    let s_e = if is_left {
        edge_scores_left(wx, ww, ax, aw, mid_x, t_edge)
    } else {
        edge_scores_right(wx, ww, ax, aw, mid_x, t_edge)
    };
    let s_s = split_score(wx, ww, aw, ax, is_left);

    let prefix = if is_left { "left" } else { "right" };
    components.insert(format!("{prefix}.vertical"), s_v);
    components.insert(format!("{prefix}.width"), s_w);
    components.insert(format!("{prefix}.edges"), s_e);
    components.insert(format!("{prefix}.split"), s_s);

    cfg.weight_vertical * s_v
        + cfg.weight_width * s_w
        + cfg.weight_edges * s_e
        + cfg.weight_split * s_s
}

/// Heuristic half-tile classification for left/right against the work area.
///
/// `log_hard_gates`: print `common` / `left` / `right` gate deltas and pass flags to stderr (e.g. `ESKERRA_DEBUG_TILING=1`).
///
/// `gate_geom`: production should pass [`HardGateGeometry::Physical`] with raw monitor/window physical rects and monitor `scale_factor`.
pub fn score_tiling(
    audit: &GeometryAudit,
    cfg: &TilingConfig,
    with_components: bool,
    log_hard_gates: bool,
    gate_geom: HardGateGeometry,
) -> TilingDetection {
    let cfg = (*cfg).sanitized();
    if audit.is_maximized {
        return TilingDetection {
            state: TilingState::None,
            confidence: 0.0,
            components: None,
        };
    }
    if audit.work_area.w <= f64::EPSILON || audit.work_area.h <= f64::EPSILON {
        return TilingDetection {
            state: TilingState::None,
            confidence: 0.0,
            components: None,
        };
    }

    let gates = evaluate_hard_gates_dispatch(audit, &cfg, gate_geom);
    if log_hard_gates {
        let space = match gate_geom {
            HardGateGeometry::Physical { .. } => "physical",
            HardGateGeometry::FromAuditLogical => "logical",
        };
        eprintln_hard_gates(&gates, space);
    }

    let mut components = HashMap::new();
    let left_total = score_side(audit, &cfg, true, &mut components);
    let right_total = score_side(audit, &cfg, false, &mut components);

    if !cfg.require_hard_gates {
        let diff = left_total - right_total;
        if diff.abs() < cfg.fuzzy_tie_epsilon {
            return TilingDetection {
                state: TilingState::None,
                confidence: left_total.max(right_total),
                components: with_components.then_some(components),
            };
        }
        let (winner, conf_w) = if diff > 0.0 {
            (TilingState::Left, left_total)
        } else {
            (TilingState::Right, right_total)
        };
        let second = left_total.min(right_total);
        let state = if conf_w >= cfg.c_min && (conf_w - second) >= cfg.c_margin {
            winner
        } else {
            TilingState::None
        };
        let confidence = if state == TilingState::None {
            conf_w.max(second)
        } else {
            conf_w
        };
        return TilingDetection {
            state,
            confidence,
            components: with_components.then_some(components),
        };
    }

    let left_ok = gates.left_ok;
    let right_ok = gates.right_ok;

    let (state, conf) = match (left_ok, right_ok) {
        (true, true) => (TilingState::None, left_total.max(right_total)),
        (true, false) => {
            if left_total >= cfg.c_min && (left_total - right_total) >= cfg.c_margin {
                (TilingState::Left, left_total)
            } else {
                (TilingState::None, left_total.max(right_total))
            }
        }
        (false, true) => {
            if right_total >= cfg.c_min && (right_total - left_total) >= cfg.c_margin {
                (TilingState::Right, right_total)
            } else {
                (TilingState::None, left_total.max(right_total))
            }
        }
        (false, false) => (TilingState::None, left_total.max(right_total)),
    };

    let confidence = conf;

    TilingDetection {
        state,
        confidence,
        components: with_components.then_some(components),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn work() -> Rect {
        Rect {
            x: 0.0,
            y: 27.0,
            w: 1920.0,
            h: 1053.0,
        }
    }

    #[test]
    fn maximized_returns_none() {
        let audit = GeometryAudit {
            window_outer: Rect {
                x: 0.0,
                y: 0.0,
                w: 1920.0,
                h: 1080.0,
            },
            work_area: work(),
            is_maximized: true,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::None);
        assert_eq!(d.confidence, 0.0);
    }

    #[test]
    fn perfect_left_half() {
        let w = work();
        let half = w.w / 2.0;
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x,
                y: w.y,
                w: half,
                h: w.h,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::Left);
        assert!(d.confidence >= 0.72);
    }

    #[test]
    fn perfect_right_half() {
        let w = work();
        let half = w.w / 2.0;
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x + half,
                y: w.y,
                w: half,
                h: w.h,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::Right);
        assert!(d.confidence >= 0.72);
    }

    fn linux_style_fuzzy_config() -> TilingConfig {
        TilingConfig {
            require_hard_gates: false,
            c_min: 0.78,
            c_margin: 0.10,
            ..Default::default()
        }
    }

    #[test]
    fn linux_style_fuzzy_detects_perfect_left() {
        let w = work();
        let half = w.w / 2.0;
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x,
                y: w.y,
                w: half,
                h: w.h,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &linux_style_fuzzy_config(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::Left);
    }

    /// Horizontally centered half-width: left/right soft scores tie; must not default to left.
    #[test]
    fn linux_fuzzy_symmetric_half_width_centered_is_none() {
        let w = work();
        let half = w.w / 2.0;
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x + w.w / 4.0,
                y: w.y,
                w: half,
                h: w.h,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &linux_style_fuzzy_config(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::None);
    }

    #[test]
    fn linux_style_fuzzy_rejects_centered_float() {
        let w = work();
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x + w.w * 0.25,
                y: w.y + 100.0,
                w: w.w * 0.5,
                h: w.h * 0.6,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &linux_style_fuzzy_config(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::None);
    }

    #[test]
    fn centered_floating_window_is_none() {
        let w = work();
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x + w.w * 0.25,
                y: w.y + 100.0,
                w: w.w * 0.5,
                h: w.h * 0.6,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::None);
    }

    #[test]
    fn small_pixel_slop_still_left() {
        let w = work();
        let half = w.w / 2.0;
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x + 3.0,
                y: w.y - 2.0,
                w: half + 4.0,
                h: w.h + 1.0,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::Left);
    }

    #[test]
    fn half_width_but_misaligned_horizontally_is_none() {
        let w = work();
        let half = w.w / 2.0;
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x + w.w * 0.25,
                y: w.y,
                w: half,
                h: w.h,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d.state, TilingState::None);
    }

    #[test]
    fn physical_hard_gates_agree_with_logical_when_audit_is_unified() {
        let scale = 2.0;
        let work_phys = Rect {
            x: 100.0,
            y: 54.0,
            w: 3840.0,
            h: 2106.0,
        };
        let half = work_phys.w / 2.0;
        let window_phys = Rect {
            x: work_phys.x,
            y: work_phys.y,
            w: half,
            h: work_phys.h,
        };
        let audit = GeometryAudit {
            window_outer: Rect {
                x: work_phys.x / scale,
                y: work_phys.y / scale,
                w: half / scale,
                h: work_phys.h / scale,
            },
            work_area: Rect {
                x: work_phys.x / scale,
                y: work_phys.y / scale,
                w: work_phys.w / scale,
                h: work_phys.h / scale,
            },
            is_maximized: false,
        };
        let d_phys = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::Physical {
                window: window_phys,
                work: work_phys,
                scale_ref: scale,
            },
        );
        let d_log = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(d_phys.state, TilingState::Left);
        assert_eq!(d_log.state, TilingState::Left);
    }

    #[test]
    fn physical_hard_gates_perfect_right_half() {
        let scale = 2.0;
        let work_phys = Rect {
            x: 100.0,
            y: 54.0,
            w: 3840.0,
            h: 2106.0,
        };
        let half = work_phys.w / 2.0;
        let window_phys = Rect {
            x: work_phys.x + half,
            y: work_phys.y,
            w: half,
            h: work_phys.h,
        };
        let audit = GeometryAudit {
            window_outer: Rect {
                x: window_phys.x / scale,
                y: window_phys.y / scale,
                w: half / scale,
                h: work_phys.h / scale,
            },
            work_area: Rect {
                x: work_phys.x / scale,
                y: work_phys.y / scale,
                w: work_phys.w / scale,
                h: work_phys.h / scale,
            },
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::Physical {
                window: window_phys,
                work: work_phys,
                scale_ref: scale,
            },
        );
        assert_eq!(d.state, TilingState::Right);
    }

    #[test]
    fn physical_gates_left_when_mixed_scale_logical_audit_would_fail() {
        let work_phys = Rect {
            x: 0.0,
            y: 54.0,
            w: 3840.0,
            h: 2106.0,
        };
        let half = work_phys.w / 2.0;
        let window_phys = Rect {
            x: 0.0,
            y: 54.0,
            w: half,
            h: work_phys.h,
        };
        // Window width in logical px is too small (as if work were 1920 logical but window used wrong scale).
        let audit_broken = GeometryAudit {
            window_outer: Rect {
                x: 0.0,
                y: 27.0,
                w: 800.0,
                h: 1053.0,
            },
            work_area: Rect {
                x: 0.0,
                y: 27.0,
                w: 1920.0,
                h: 1053.0,
            },
            is_maximized: false,
        };
        let none_from_logical_gates = score_tiling(
            &audit_broken,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        assert_eq!(none_from_logical_gates.state, TilingState::None);

        // Correct unified audit for soft scores; physical rects match the real tiled window.
        let audit_unified = GeometryAudit {
            window_outer: Rect {
                x: 0.0,
                y: 27.0,
                w: 960.0,
                h: 1053.0,
            },
            work_area: Rect {
                x: 0.0,
                y: 27.0,
                w: 1920.0,
                h: 1053.0,
            },
            is_maximized: false,
        };
        let d = score_tiling(
            &audit_unified,
            &TilingConfig::default(),
            false,
            false,
            HardGateGeometry::Physical {
                window: window_phys,
                work: work_phys,
                scale_ref: 2.0,
            },
        );
        assert_eq!(d.state, TilingState::Left);
    }

    #[test]
    fn components_included_when_requested() {
        let w = work();
        let half = w.w / 2.0;
        let audit = GeometryAudit {
            window_outer: Rect {
                x: w.x,
                y: w.y,
                w: half,
                h: w.h,
            },
            work_area: w,
            is_maximized: false,
        };
        let d = score_tiling(
            &audit,
            &TilingConfig::default(),
            true,
            false,
            HardGateGeometry::FromAuditLogical,
        );
        let c = d.components.expect("components");
        assert!(c.contains_key("left.vertical"));
        assert!(c.contains_key("right.vertical"));
    }
}
