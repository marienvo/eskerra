/**
 * Speech-like startup spectrum: phrase/syllable envelopes, formant lobes, sparse frication.
 * Used from Reanimated UI worklet and from Jest (directive string is inert in Node).
 */

/** Wall-clock to animation time (speech-like syllable rate). */
export const STARTUP_SPECTRUM_TIME_SCALE = 1.05;

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
  const power = 0.58 + 0.22 * irregular01(tau * 0.88, 1.7);
  let shaped = Math.pow(halfWave, power);
  const breath = 0.68 + 0.32 * (0.5 + 0.5 * Math.sin(tau * 0.41 + 0.55));
  const irregular = 0.76 + 0.24 * irregular01(tau * 0.39, 2.1);
  const withinPhrase = 0.58 + 0.42 * Math.pow(0.5 + 0.5 * Math.sin(tau * 4.31 + 0.18), 1.55);
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
  const sharp = 0.26 + 0.14 * irregular01(tau * 1.12, 3.4);
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
    const grain = 0.5 + 0.5 * Math.sin(index * 0.73 + 0.15);
    return Math.min(1, Math.max(0.1, shell * grain * 0.95));
  }

  const tau = tSec * STARTUP_SPECTRUM_TIME_SCALE;
  const norm = barCount <= 1 ? 0.5 : index / (barCount - 1);

  const phrase = phraseEnvelope(tau);
  const syll = syllablePulse(tau, phrase);

  const shell = formantShell(norm, tau);
  const fric = fricativeLift(norm, tau, phrase);
  const grain = noiseGrain(norm, index, tau, phrase);

  let body = shell + fric + grain;
  body = Math.max(0, Math.min(1, body));

  let v = syll * body;
  v = Math.min(1, v);
  v = Math.pow(v, 0.88);
  return v;
}

/** Fraction for horizontal neighbor mix (vowel-like cohesion); keep low so bars do not read as one arc. */
export const STARTUP_SPECTRUM_SPATIAL_SMOOTH = 0.1;

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
