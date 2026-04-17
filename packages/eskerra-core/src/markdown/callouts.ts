/**
 * Obsidian-style markdown callouts: `> [!type] optional title` (GitHub alerts compatible subset).
 */

export type CalloutColor = 'blue' | 'cyan' | 'teal' | 'green' | 'yellow' | 'orange' | 'red' | 'purple' | 'grey';

export type CalloutCatalogEntry = {
  /** Material Icons ligature name (e.g. `edit`, `warning`). */
  icon: string;
  color: CalloutColor;
  /** Default title when the author omits text after `]`. */
  label: string;
  /** Alternate type tokens (lowercase) that resolve to this entry. */
  aliases?: readonly string[];
};

/** Canonical callout keys (lowercase). */
export const CALLOUT_CATALOG: Readonly<Record<string, CalloutCatalogEntry>> = {
  note: {icon: 'edit', color: 'blue', label: 'Note'},
  info: {icon: 'info', color: 'cyan', label: 'Info'},
  abstract: {
    icon: 'summarize',
    color: 'cyan',
    label: 'Abstract',
    aliases: ['summary', 'tldr'],
  },
  todo: {icon: 'check_circle', color: 'blue', label: 'Todo'},
  tip: {
    icon: 'local_fire_department',
    color: 'teal',
    label: 'Tip',
    aliases: ['hint', 'important'],
  },
  success: {
    icon: 'check',
    color: 'green',
    label: 'Success',
    aliases: ['check', 'done'],
  },
  question: {
    icon: 'help_outline',
    color: 'orange',
    label: 'Question',
    aliases: ['help', 'faq'],
  },
  warning: {
    icon: 'warning',
    color: 'yellow',
    label: 'Warning',
    aliases: ['caution', 'attention'],
  },
  failure: {
    icon: 'close',
    color: 'red',
    label: 'Failure',
    aliases: ['fail', 'missing'],
  },
  danger: {icon: 'bolt', color: 'red', label: 'Danger', aliases: ['error']},
  bug: {icon: 'bug_report', color: 'red', label: 'Bug'},
  example: {icon: 'list', color: 'purple', label: 'Example'},
  quote: {icon: 'format_quote', color: 'grey', label: 'Quote', aliases: ['cite']},
} as const;

export type ResolvedCallout = {
  /** Canonical type key (e.g. `tip`). */
  type: string;
  icon: string;
  color: CalloutColor;
  label: string;
};

const ALIAS_TO_CANONICAL: ReadonlyMap<string, string> = buildAliasMap();

function buildAliasMap(): Map<string, string> {
  const m = new Map<string, string>();
  for (const [canonical, entry] of Object.entries(CALLOUT_CATALOG)) {
    const c = canonical.toLowerCase();
    m.set(c, canonical);
    for (const a of entry.aliases ?? []) {
      m.set(a.toLowerCase(), canonical);
    }
  }
  return m;
}

/**
 * Resolves a raw bracket type (e.g. `TIP`, `hint`) to catalog metadata.
 * Unknown types fall back to `note`.
 */
export function resolveCallout(rawType: string): ResolvedCallout {
  const key = rawType.trim().toLowerCase();
  const canonical = ALIAS_TO_CANONICAL.get(key) ?? 'note';
  const entry = CALLOUT_CATALOG[canonical] ?? CALLOUT_CATALOG.note;
  return {
    type: canonical,
    icon: entry.icon,
    color: entry.color,
    label: entry.label,
  };
}

/** First-line callout header: `> [!type]` … optional `+`/`-` (fold markers, ignored for display). */
const CALLOUT_HEADER_RE =
  /^(\s*((?:>\s*)+))(\[!([A-Za-z][A-Za-z0-9-]*)\])([+-])?(\s*(.*))?$/;

export type MatchedCalloutHeader = {
  /** Canonical resolved type. */
  type: string;
  /** Raw token inside brackets before normalization. */
  rawType: string;
  /** Title after `]` / fold marker; empty if none. */
  title: string;
  /** Column range in `lineText` covering `[!type]` and optional `+`/`-`. */
  startCol: number;
  endCol: number;
};

function countQuoteMarkers(prefix: string): number {
  let n = 0;
  for (let i = 0; i < prefix.length; i++) {
    if (prefix[i] === '>') n++;
  }
  return n;
}

/**
 * Parses the first line of a blockquote for an Obsidian/GitHub-style callout header.
 * Returns null if the line is not a top-level callout header (e.g. `> > [!tip]` is treated as nested, not a header).
 */
export function matchCalloutHeader(lineText: string): MatchedCalloutHeader | null {
  const m = CALLOUT_HEADER_RE.exec(lineText);
  if (!m) {
    return null;
  }
  const prefixWithWs = m[1];
  const quoteOnly = m[2];
  const bracketToken = m[3];
  const rawType = m[4];
  const foldMarker = m[5] ?? '';
  const titlePart = (m[7] ?? '').trim();

  if (countQuoteMarkers(quoteOnly) !== 1) {
    return null;
  }

  const resolved = resolveCallout(rawType);
  const tokenStart = prefixWithWs.length;
  const tokenEnd = tokenStart + bracketToken.length + foldMarker.length;

  return {
    type: resolved.type,
    rawType,
    title: titlePart,
    startCol: tokenStart,
    endCol: tokenEnd,
  };
}
