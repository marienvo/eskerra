export type SharePayloadInput = {
  subject: string;
  text: string;
};

const URL_LIKE = /^https?:\/\//i;

/**
 * Maps Android SEND extras into the inbox compose field format: first line is the title, blank
 * line, then body (see {@link parseComposeInput} in `@eskerra/core`).
 */
export function sharePayloadToComposeInput({subject, text}: SharePayloadInput): string {
  const sub = subject.trim();
  const txt = text.trim();
  if (!sub && !txt) {
    return '';
  }
  if (sub) {
    const titleLine = sub.split(/\r?\n/)[0]!.trim().slice(0, 200);
    return txt ? `${titleLine}\n\n${txt}` : titleLine;
  }

  const lines = txt.split(/\r?\n/);
  const firstLine = (lines[0] ?? '').trim();
  const bodyAfterFirst = lines.slice(1).join('\n').trim();
  if (bodyAfterFirst) {
    return `${firstLine.slice(0, 200)}\n\n${bodyAfterFirst}`;
  }
  if (URL_LIKE.test(firstLine)) {
    return `Shared\n\n${firstLine}`;
  }
  return firstLine;
}
