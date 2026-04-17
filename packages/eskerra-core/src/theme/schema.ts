/** 1–30 hex strings `#RRGGBB` after validation. */
export type ThemePalette = readonly string[];

export type ThemeSource = 'bundled' | 'vault';

export type ThemeDefinition = {
  /** Stable kebab-id: bundled ids are fixed; vault themes use the JSON filename stem. */
  id: string;
  /** Display name; full Unicode allowed. */
  name: string;
  light: {palette: ThemePalette};
  dark: {palette: ThemePalette};
  source: ThemeSource;
  /** Vault only: `<id>.json` */
  fileName?: string;
};

export const THEME_PALETTE_MIN = 1;
export const THEME_PALETTE_MAX = 30;

const HEX6 = /^#[0-9A-Fa-f]{6}$/;

export class ThemeLoadError extends Error {
  readonly code = 'ThemeLoadError';

  constructor(message: string) {
    super(message);
    this.name = 'ThemeLoadError';
  }
}

function validatePalette(label: string, value: unknown): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    throw new ThemeLoadError(`${label}: palette must be a non-empty array.`);
  }
  if (value.length > THEME_PALETTE_MAX) {
    throw new ThemeLoadError(`${label}: palette has at most ${THEME_PALETTE_MAX} colors.`);
  }
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== 'string') {
      throw new ThemeLoadError(`${label}: palette entries must be hex strings (#RRGGBB).`);
    }
    const t = entry.trim();
    if (!HEX6.test(t)) {
      throw new ThemeLoadError(`${label}: invalid chrome color (expected #RRGGBB): ${entry}`);
    }
    out.push(t);
  }
  return out;
}

function themeFileStem(fileName: string): string {
  const n = fileName.trim();
  if (!n.toLowerCase().endsWith('.json')) {
    throw new ThemeLoadError(`Theme file name must end with .json: ${fileName}`);
  }
  return n.slice(0, -'.json'.length);
}

/**
 * Parses a theme JSON document. For vault files, `id` is always the `.json` stem (authoritative).
 */
export function parseThemeJson(
  raw: string,
  options: {source: 'bundled'} | {source: 'vault'; fileName: string},
): ThemeDefinition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new ThemeLoadError('Theme file is not valid JSON.');
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new ThemeLoadError('Theme root must be a JSON object.');
  }

  const o = parsed as Record<string, unknown>;
  const nameRaw = o.name;
  if (typeof nameRaw !== 'string' || nameRaw.trim() === '') {
    throw new ThemeLoadError('Theme must include a non-empty string "name".');
  }

  const light = o.light;
  const dark = o.dark;
  if (typeof light !== 'object' || light === null || Array.isArray(light)) {
    throw new ThemeLoadError('Theme must include an object "light".');
  }
  if (typeof dark !== 'object' || dark === null || Array.isArray(dark)) {
    throw new ThemeLoadError('Theme must include an object "dark".');
  }

  const lightPalette = validatePalette('light', (light as Record<string, unknown>).palette);
  const darkPalette = validatePalette('dark', (dark as Record<string, unknown>).palette);

  if (options.source === 'bundled') {
    const idRaw = o.id;
    if (typeof idRaw !== 'string' || idRaw.trim() === '') {
      throw new ThemeLoadError('Bundled theme must include a non-empty string "id".');
    }
    return {
      id: idRaw.trim(),
      name: nameRaw.trim(),
      light: {palette: lightPalette},
      dark: {palette: darkPalette},
      source: 'bundled',
    };
  }

  const stem = themeFileStem(options.fileName);
  const idFromJson = o.id;
  if (typeof idFromJson === 'string' && idFromJson.trim() !== '' && idFromJson.trim() !== stem) {
    throw new ThemeLoadError(
      `Theme "id" in JSON ("${idFromJson.trim()}") must match the file name stem ("${stem}") or be omitted.`,
    );
  }

  return {
    id: stem,
    name: nameRaw.trim(),
    light: {palette: lightPalette},
    dark: {palette: darkPalette},
    source: 'vault',
    fileName: options.fileName.trim(),
  };
}

export function serializeVaultThemeJson(theme: ThemeDefinition): string {
  if (theme.source !== 'vault') {
    throw new ThemeLoadError('serializeVaultThemeJson expects a vault theme.');
  }
  const body = {
    name: theme.name,
    light: {palette: [...theme.light.palette]},
    dark: {palette: [...theme.dark.palette]},
  };
  return `${JSON.stringify(body, null, 2)}\n`;
}
