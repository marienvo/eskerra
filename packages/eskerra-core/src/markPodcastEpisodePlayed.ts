const UNPLAYED_PREFIX_PATTERN = /^(\s*-\s*\[)\s(\]\s+)/;

/**
 * Flip `- [ ]` → `- [x]` on the first line containing `mp3Url` (podcast episode row).
 */
export function markEpisodeAsPlayedInContent(
  content: string,
  mp3Url: string,
): {nextContent: string; updated: boolean} {
  const lines = content.split(/\r?\n/);
  let updated = false;

  const nextLines = lines.map(line => {
    if (updated || !line.includes(mp3Url)) {
      return line;
    }

    const nextLine = line.replace(UNPLAYED_PREFIX_PATTERN, '$1x$2');
    if (nextLine !== line) {
      updated = true;
    }

    return nextLine;
  });

  return {
    nextContent: nextLines.join('\n'),
    updated,
  };
}
