export type LoneLinkLineInfo = {
  /** Absolute http(s) URL extracted from the line. */
  url: string;
  /** Character offset of the URL within the line (after leading whitespace + optional list marker). */
  urlOffset: number;
};

const LIST_MARKER_GROUP = String.raw`(?:(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)`;
const URL_GROUP = String.raw`https?:\/\/\S+`;
const LONE_LINK_LINE_RX = new RegExp(
  `^(\\s*)(${LIST_MARKER_GROUP})?(${URL_GROUP})\\s*$`,
);

function trimTrailingUrlPunctuation(value: string): string {
  let out = value;
  while (out.length > 0) {
    const last = out[out.length - 1];
    if (last !== ')' && last !== ',' && last !== '.' && last !== ';' && last !== '!' && last !== '?') {
      break;
    }
    out = out.slice(0, -1);
  }
  return out;
}

/**
 * Returns info about a line that contains _only_ a bare `http(s)://` URL, optionally preceded by
 * a single list marker (`-`, `*`, `+`, `1.`, `1)`, with optional GFM task-box). Returns `null`
 * for lines with any other content (labels, inline text, markdown link syntax, etc.).
 */
export function parseLoneLinkLine(lineText: string): LoneLinkLineInfo | null {
  const m = LONE_LINK_LINE_RX.exec(lineText);
  if (!m) {
    return null;
  }
  const leading = m[1] ?? '';
  const marker = m[2] ?? '';
  const rawUrl = m[3] ?? '';
  const url = trimTrailingUrlPunctuation(rawUrl);
  if (!/^https?:\/\/[^\s]+\.[^\s]/u.test(url)) {
    return null;
  }
  return {url, urlOffset: leading.length + marker.length};
}
