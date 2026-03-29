/**
 * Speech-like startup spectrum: phrase/syllable envelopes, formant lobes, sparse frication.
 * Used from Reanimated UI worklet and from Jest (directive string is inert in Node).
 */

/** Wall-clock to animation time (speech-like syllable rate). */
export const STARTUP_SPECTRUM_TIME_SCALE = 1.05;

/**
 * How strongly the static logo-shaped spatial envelope mixes into formantShell.
 * Phrase/syllable/frication/noise paths stay unchanged; only the shell is biased.
 */
export const LOGO_ENVELOPE_BLEND = 0.35;

/** Minimum logo envelope so low bins are not flattened to silence when blended. */
const LOGO_ENVELOPE_FLOOR = 0.18;

/** White segment peak along u in [0,1] (~60% of the span; 7th of 11 bars in the logo). */
const LOGO_WHITE_PEAK_U = 0.6;

const LOGO_WHITE_LEFT_WIDTH = 0.26;
const LOGO_WHITE_RIGHT_WIDTH = 0.3;
const LOGO_CYAN_DECAY_GAMMA = 1.18;

/** Phrase period ~3.2s (speaking half-waves + silence between). */
const PHRASE_OMEGA = (2 * Math.PI) / 3.2;

/**
 * Deterministic “jitter”: incommensurate sines → non-repeating micro-variation (not one smooth arc).
 */
function irregular01(tau: number, seed: number): number {
  'worklet';
  const u =
    0.5 * Math.sin(tau * 2.173 + seed) +
    0.32 * Math.sin(tau * 3.781 + seed * 1.63) +
    0.24 * Math.sin(tau * 5.917 + seed * 0.41) +
    0.18 * Math.sin(tau * 8.041 + seed * 2.27) +
    0.12 * Math.sin(tau * 11.56 + seed * 0.88);
  return 0.5 + 0.5 * Math.sin(u);
}

/** Light mel-like warp: low bins span more of the "auditory" axis. */
function melLikeNorm(norm: number): number {
  'worklet';
  const alpha = 6;
  return Math.log(1 + alpha * norm) / Math.log(1 + alpha);
}

function smoothstep01(x: number): number {
  'worklet';
  const t = Math.min(1, Math.max(0, x));
  return t * t * (3 - 2 * t);
}

/** Centered bar count on the startup splash that keeps full motion amplitude. */
export const MIDDLE_STARTUP_BARS_FULL = 6;

/**
 * Per-bar gain in [0, 1] for scaling spectrum levels at display time: outer bars fixed at min
 * height, middle band full swing, smoothstep ramps in between (same math in UI and tests).
 */
export function computeStartupBarDisplayGain(
  index: number,
  barCount: number,
  middleFullCount: number = MIDDLE_STARTUP_BARS_FULL,
): number {
  'worklet';
  if (
    barCount < 2 ||
    middleFullCount < 1 ||
    middleFullCount > barCount ||
    index < 0 ||
    index >= barCount
  ) {
    return 1;
  }
  const firstMiddle = Math.floor((barCount - middleFullCount) / 2);
  const lastMiddle = firstMiddle + middleFullCount - 1;
  if (index < firstMiddle) {
    if (firstMiddle <= 0) {
      return 1;
    }
    return smoothstep01(index / firstMiddle);
  }
  if (index > lastMiddle) {
    const denom = barCount - 1 - lastMiddle;
    if (denom <= 0) {
      return 1;
    }
    return smoothstep01((barCount - 1 - index) / denom);
  }
  return 1;
}

function gaussianLobe(m: number, center: number, width: number): number {
  'worklet';
  const d = (m - center) / width;
  return Math.exp(-d * d);
}

/**
 * Slow phrase gate [0,1]: warped time + jittered rate so phrase edges feel less like one sine bow.
 */
function phraseEnvelope(tau: number): number {
  'worklet';
  const warp =
    tau +
    0.2 * Math.sin(tau * 0.46 + 0.2) +
    0.09 * Math.sin(tau * 1.07 + 1.1) +
    0.05 * Math.sin(tau * 1.63 + 0.45);
  const omegaJit = PHRASE_OMEGA * (0.86 + 0.14 * irregular01(tau * 0.51, 0.3));
  const halfWave = Math.max(0, Math.sin(warp * omegaJit));
  const power = 0.42 + 0.38 * irregular01(tau * 0.88, 1.7);
  let shaped = Math.pow(halfWave, power);
  const breath = 0.68 + 0.32 * (0.5 + 0.5 * Math.sin(tau * 0.41 + 0.55));
  const irregular = 0.76 + 0.24 * irregular01(tau * 0.39, 2.1);
  const withinPhrase = 0.58 + 0.42 * Math.pow(0.5 + 0.5 * Math.sin(tau * 4.31 + 0.18), 2.15);
  shaped *= withinPhrase;
  return Math.min(1, shaped * breath * irregular);
}

/**
 * Syllabic excitation [0,1], strongest mid-phrase; never boosts when phrase is silent.
 */
function syllablePulse(tau: number, phrase: number): number {
  'worklet';
  const p = Math.max(phrase, 0);
  const warp =
    tau +
    0.04 * Math.sin(tau * 9.7 + 0.5) +
    0.028 * Math.sin(tau * 14.2 + 1.2);
  const a = 0.5 + 0.5 * Math.sin(warp * 6.23 + 0.33);
  const b = 0.5 + 0.5 * Math.sin(warp * 7.57 + 1.91);
  const c = 0.5 + 0.5 * Math.sin(warp * 8.84 + 0.72);
  const blend = Math.max(0, a * b * (0.48 + 0.52 * c));
  const sharp = 0.42 + 0.22 * irregular01(tau * 1.12, 3.4);
  const syll = Math.pow(blend, sharp);
  const ripple = 0.82 + 0.18 * irregular01(tau * 13.1, 0.9);
  return p * Math.min(1, syll * 1.28 * ripple);
}

/** Sum of drifting formant lobes on mel-warped axis; uneven weights. */
function formantShell(norm: number, tau: number): number {
  'worklet';
  const m = melLikeNorm(norm);
  const posJit =
    0.018 * Math.sin(tau * 2.41 + norm * 4.2) +
    0.014 * Math.sin(tau * 4.92 + norm * 2.8) +
    0.011 * irregular01(tau * 1.9 + norm, 4.2);

  const c1 = 0.26 + 0.1 * Math.sin(tau * 0.63 + 0.4) + posJit;
  const c2 = 0.52 + 0.13 * Math.sin(tau * 0.52 + 2.1) + posJit * 0.85;
  const c3 = 0.76 + 0.07 * Math.sin(tau * 0.58 + 0.9) + posJit * 0.65;

  const wJ1 = 0.15 * (0.82 + 0.18 * irregular01(tau * 1.01, 5.1));
  const wJ2 = 0.11 * (0.78 + 0.22 * irregular01(tau * 1.23, 1.4));
  const wJ3 = 0.085 * (0.8 + 0.2 * irregular01(tau * 0.94, 2.8));

  const g1 = gaussianLobe(m, c1, wJ1);
  const g2 = gaussianLobe(m, c2, wJ2);
  const g3 = gaussianLobe(m, c3, wJ3);

  const a1 = 0.88 + 0.24 * irregular01(tau * 0.76, 6.0);
  const a2 = 0.68 + 0.26 * irregular01(tau * 0.69, 1.1);
  const a3 = 0.38 + 0.32 * irregular01(tau * 0.81, 3.0);

  const raw = a1 * g1 + a2 * g2 + a3 * g3;
  return Math.min(1, raw * 1.55);
}

/** Short high-frequency lift during phrase, quasi-random sparse bursts. */
function fricativeLift(norm: number, tau: number, phrase: number): number {
  'worklet';
  if (phrase < 0.08) {
    return 0;
  }
  const p = Math.max(phrase, 0);
  const rate = 2.65 + 0.55 * Math.sin(tau * 0.73 + 0.4) + 0.35 * Math.sin(tau * 1.41);
  const beat = tau * rate + 0.13 * Math.sin(tau * 6.8);
  const frac = beat - Math.floor(beat);
  const width = 0.042 + 0.025 * (0.5 + 0.5 * Math.sin(tau * 2.3 + 0.6));
  const window = frac < width ? smoothstep01(1 - frac / width) : 0;
  const hf = norm * norm;
  return window * hf * 0.62 * p;
}

/** Low-amplitude grain, only while phrase is active (no dancing noise floor in silence). */
function noiseGrain(norm: number, index: number, tau: number, phrase: number): number {
  'worklet';
  const p = Math.max(phrase, 0);
  if (p < 0.02) {
    return 0;
  }
  const wobble =
    0.34 * (0.5 + 0.5 * Math.sin(tau * 14.2 + index * 0.85)) +
    0.28 * (0.5 + 0.5 * Math.sin(tau * 18.4 + index * 1.12 + norm * 2.1)) +
    0.38 * irregular01(tau * 3.1 + index * 0.19, norm * 5.7 + index * 0.31);
  return wobble * 0.085 * p;
}

/**
 * Micro-motion only while the phrase gate is open (flat meter in silence).
 */
function ambientPhraseShimmer(norm: number, index: number, tau: number, phrase: number): number {
  'worklet';
  const p = Math.max(phrase, 0);
  if (p < 0.05) {
    return 0;
  }
  const w =
    0.04 * (0.5 + 0.5 * Math.sin(tau * 12.1 + index * 0.93)) +
    0.035 * (0.5 + 0.5 * Math.sin(tau * 17.4 + index * 0.71 + norm * 2.4)) +
    0.028 * irregular01(tau * 2.51 + index * 0.13, norm * 1.9 + index * 0.07);
  return Math.min(0.055, (0.014 + w) * p);
}

/** Max normalized add for idle micro-motion (before extra phrase/level weights). */
const IDLE_MICRO_CAP = 0.032;

/** Phrase low -> weight toward 1 (stilte tussen zinnen). */
function idleWeightFromPhrase(phrase: number): number {
  'worklet';
  const p = Math.max(phrase, 0);
  return 1 - smoothstep01(p / 0.11);
}

/** Core level low (vóór gamma) -> weight toward 1 (staart / bijna stil binnen frase). */
function idleWeightFromCoreLevel(vCore: number): number {
  'worklet';
  const v = Math.max(vCore, 0);
  return 1 - smoothstep01(v / 0.082);
}

/**
 * Deterministic [0,1] micro-oscillation per bar; scales by IDLE_MICRO_CAP and blend weights.
 */
function idleMicroMotion01(norm: number, index: number, tau: number): number {
  'worklet';
  const w =
    0.5 * (0.5 + 0.5 * Math.sin(tau * 15.3 + index * 1.07)) +
    0.35 * (0.5 + 0.5 * Math.sin(tau * 21.1 + norm * 2.9 + index * 0.73)) +
    0.15 * irregular01(tau * 2.9 + index * 0.11, norm * 3.1 + index * 0.29);
  return Math.min(1, Math.max(0, w));
}

/**
 * Spatial weights matching the app logo: white rises to a late peak then eases; cyan
 * starts high and tapers. Split matches UI: ceil(barCount / 2) white bars first.
 * Returns [LOGO_ENVELOPE_FLOOR, 1].
 */
export function logoSpatialEnvelope(index: number, barCount: number): number {
  'worklet';
  if (barCount <= 1) {
    return 1;
  }
  const split = Math.ceil(barCount / 2);
  let raw: number;
  if (index < split) {
    const denom = Math.max(split - 1, 1);
    const u = index / denom;
    const peak = LOGO_WHITE_PEAK_U;
    if (u <= peak) {
      const d = (peak - u) / LOGO_WHITE_LEFT_WIDTH;
      raw = Math.exp(-d * d);
    } else {
      const d = (u - peak) / LOGO_WHITE_RIGHT_WIDTH;
      raw = Math.exp(-d * d);
    }
  } else {
    const denom = Math.max(barCount - split - 1, 1);
    const v = (index - split) / denom;
    const t = smoothstep01(v);
    raw = Math.pow(1 - t, LOGO_CYAN_DECAY_GAMMA);
  }
  return LOGO_ENVELOPE_FLOOR + (1 - LOGO_ENVELOPE_FLOOR) * raw;
}

function blendFormantShellWithLogo(shell: number, index: number, barCount: number): number {
  'worklet';
  const logoW = logoSpatialEnvelope(index, barCount);
  const b = LOGO_ENVELOPE_BLEND;
  return shell * (1 - b + b * logoW);
}

/**
 * Normalized bar level [0, 1].
 */
export function computeStartupSpectrumSample(
  tSec: number,
  index: number,
  barCount: number,
  staticOnly: boolean,
): number {
  'worklet';
  if (staticOnly) {
    const norm = barCount <= 1 ? 0.5 : index / (barCount - 1);
    const m = melLikeNorm(norm);
    const shell =
      0.95 * gaussianLobe(m, 0.28, 0.14) +
      0.85 * gaussianLobe(m, 0.52, 0.11) +
      0.45 * gaussianLobe(m, 0.74, 0.09);
    const shellBiased = blendFormantShellWithLogo(shell, index, barCount);
    const grain = 0.5 + 0.5 * Math.sin(index * 0.73 + 0.15);
    return Math.min(1, Math.max(0.1, shellBiased * grain * 0.95));
  }

  const tau = tSec * STARTUP_SPECTRUM_TIME_SCALE;
  const norm = barCount <= 1 ? 0.5 : index / (barCount - 1);

  const phrase = phraseEnvelope(tau);
  const syll = syllablePulse(tau, phrase);

  const shell = formantShell(norm, tau);
  const shellBiased = blendFormantShellWithLogo(shell, index, barCount);
  const fric = fricativeLift(norm, tau, phrase);
  const grain = noiseGrain(norm, index, tau, phrase);

  let body = shellBiased + fric + grain;
  body = Math.max(0, Math.min(1, body));

  let vCore = syll * body;
  vCore = Math.min(1, vCore + ambientPhraseShimmer(norm, index, tau, phrase));

  const idleW = Math.max(
    idleWeightFromPhrase(phrase),
    idleWeightFromCoreLevel(vCore),
  );
  const idle =
    idleMicroMotion01(norm, index, tau) * IDLE_MICRO_CAP * idleW;

  let v = Math.min(1, vCore + idle);
  v = Math.pow(v, 0.94);
  return Math.min(1, v);
}

/** Fraction for horizontal neighbor mix; low for meter-like per-band independence on falls. */
export const STARTUP_SPECTRUM_SPATIAL_SMOOTH = 0.045;

export function smoothSpectrumLevelsInPlace(levels: number[], rho: number): void {
  'worklet';
  const n = levels.length;
  if (n <= 2 || rho <= 0) {
    return;
  }
  const prev = levels.slice();
  for (let i = 0; i < n; i++) {
    const left = i > 0 ? prev[i - 1]! : prev[i]!;
    const right = i < n - 1 ? prev[i + 1]! : prev[i]!;
    const neighborAvg = 0.5 * (left + right);
    levels[i] = prev[i]! * (1 - rho) + neighborAvg * rho;
  }
}
