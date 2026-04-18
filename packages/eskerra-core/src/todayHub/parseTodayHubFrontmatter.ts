export type TodayHubPerpetualType = 'weekly';

export const TODAY_HUB_START_DAYS = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;

export type TodayHubStartDay = (typeof TODAY_HUB_START_DAYS)[number];

const START_DAY_TO_JS: Record<TodayHubStartDay, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

export function todayHubStartJsDay(start: TodayHubStartDay): number {
  return START_DAY_TO_JS[start];
}

function isTodayHubStartDay(v: string): v is TodayHubStartDay {
  return (TODAY_HUB_START_DAYS as readonly string[]).includes(v);
}

export type TodayHubSettings = {
  perpetualType: TodayHubPerpetualType;
  columns: string[];
  start: TodayHubStartDay;
};

const DEFAULT_SETTINGS: TodayHubSettings = {
  perpetualType: 'weekly',
  columns: [],
  start: 'monday',
};

function normalizeKey(line: string): string | null {
  const m = /^([a-zA-Z0-9_]+)\s*:/.exec(line.trim());
  return m ? m[1].toLowerCase() : null;
}

function scalarAfterColon(line: string): string {
  const idx = line.indexOf(':');
  if (idx === -1) {
    return '';
  }
  return line.slice(idx + 1).trim();
}

/**
 * Reads the first YAML frontmatter block only. Unknown keys ignored.
 * `columns` list items: lines `  - value` after `columns:`.
 */
export function parseTodayHubFrontmatter(markdown: string): TodayHubSettings {
  const normalized = markdown.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  let i = 0;
  while (i < lines.length && lines[i].trim() === '') {
    i += 1;
  }
  if (lines[i]?.trim() !== '---') {
    return {...DEFAULT_SETTINGS};
  }
  i += 1;
  const fmStart = i;
  while (i < lines.length && lines[i].trim() !== '---') {
    i += 1;
  }
  if (i >= lines.length) {
    return {...DEFAULT_SETTINGS};
  }
  const fmLines = lines.slice(fmStart, i);
  const next: TodayHubSettings = {...DEFAULT_SETTINGS};

  for (let j = 0; j < fmLines.length; j++) {
    const raw = fmLines[j];
    const key = normalizeKey(raw);
    if (!key) {
      continue;
    }
    if (key === 'perpetualtype') {
      const v = scalarAfterColon(raw).toLowerCase();
      if (v === 'weekly') {
        next.perpetualType = 'weekly';
      }
      continue;
    }
    if (key === 'start') {
      const v = scalarAfterColon(raw).toLowerCase();
      if (isTodayHubStartDay(v)) {
        next.start = v;
      }
      continue;
    }
    if (key === 'columns') {
      const cols: string[] = [];
      let k = j + 1;
      while (k < fmLines.length) {
        const indent = fmLines[k].match(/^(\s*)-/);
        const nextKey = normalizeKey(fmLines[k]);
        if (nextKey && !indent) {
          break;
        }
        const listM = /^\s*-\s*(.*)$/.exec(fmLines[k]);
        if (listM) {
          const item = listM[1].trim().replace(/^["']|["']$/g, '');
          if (item) {
            cols.push(item);
          }
        }
        k += 1;
      }
      next.columns = cols;
      j = k - 1;
    }
  }

  return next;
}

/** Editor columns = default + one per frontmatter entry. */
export function todayHubColumnCount(settings: TodayHubSettings): number {
  return 1 + settings.columns.length;
}
