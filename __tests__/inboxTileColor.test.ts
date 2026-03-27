import {
  NEUTRAL_GRAY,
  getInboxTileBackgroundColor,
  mixHex,
} from '../src/features/vault/utils/inboxTileColor';

const MS_PER_DAY = 86_400_000;

describe('mixHex', () => {
  test('returns base when t is 0', () => {
    expect(mixHex('#5DADE2', NEUTRAL_GRAY, 0)).toBe('#5dade2');
  });

  test('returns target when t is 1', () => {
    expect(mixHex('#5DADE2', NEUTRAL_GRAY, 1)).toBe('#6b7280');
  });

  test('clamps t outside 0–1', () => {
    expect(mixHex('#ff0000', '#0000ff', 2)).toBe('#0000ff');
    expect(mixHex('#ff0000', '#0000ff', -1)).toBe('#ff0000');
  });
});

describe('getInboxTileBackgroundColor', () => {
  /** Wednesday, Jan 22, 2020 12:00 local */
  const now = new Date(2020, 0, 22, 12, 0, 0).getTime();

  test('returns neutral gray when lastModified is null', () => {
    expect(getInboxTileBackgroundColor(null, now)).toBe(NEUTRAL_GRAY);
  });

  test('returns neutral gray when lastModified is in the future', () => {
    expect(getInboxTileBackgroundColor(now + MS_PER_DAY, now)).toBe(NEUTRAL_GRAY);
  });

  test('uses age under 7 days with no gray mix', () => {
    const mondayNoon = new Date(2020, 0, 20, 12, 0, 0).getTime();
    const justBeforeSevenDays = mondayNoon + 7 * MS_PER_DAY - 1000;
    expect(getInboxTileBackgroundColor(mondayNoon, justBeforeSevenDays)).toBe('#5dade2');
  });

  test('applies 25% gray at exactly 7 days (Monday base)', () => {
    const mondayNoon = new Date(2020, 0, 20, 12, 0, 0).getTime();
    expect(getInboxTileBackgroundColor(mondayNoon, mondayNoon + 7 * MS_PER_DAY)).toBe('#619eca');
  });

  test('applies 50% gray between 14 and 21 days', () => {
    const mondayNoon = new Date(2020, 0, 20, 12, 0, 0).getTime();
    const at14Days = mondayNoon + 14 * MS_PER_DAY;
    expect(getInboxTileBackgroundColor(mondayNoon, at14Days)).toBe(
      mixHex('#5DADE2', NEUTRAL_GRAY, 0.5),
    );
  });

  test('applies 75% gray between 21 and 28 days', () => {
    const mondayNoon = new Date(2020, 0, 20, 12, 0, 0).getTime();
    const at21Days = mondayNoon + 21 * MS_PER_DAY;
    expect(getInboxTileBackgroundColor(mondayNoon, at21Days)).toBe(
      mixHex('#5DADE2', NEUTRAL_GRAY, 0.75),
    );
  });

  test('returns full neutral gray at 28 days or older', () => {
    const mondayNoon = new Date(2020, 0, 20, 12, 0, 0).getTime();
    const at28Days = mondayNoon + 28 * MS_PER_DAY;
    expect(getInboxTileBackgroundColor(mondayNoon, at28Days)).toBe(NEUTRAL_GRAY);
  });

  test('maps each weekday to the correct base color when under 7 days old', () => {
    const cases: Array<[Date, string]> = [
      [new Date(2020, 0, 19, 12, 0, 0), '#73c6b6'], // Sunday
      [new Date(2020, 0, 20, 12, 0, 0), '#5dade2'], // Monday
      [new Date(2020, 0, 21, 12, 0, 0), '#58d68d'], // Tuesday
      [new Date(2020, 0, 22, 11, 0, 0), '#f4d03f'], // Wednesday (1h before now)
      [new Date(2020, 0, 16, 12, 0, 0), '#eb984e'], // Thursday
      [new Date(2020, 0, 17, 12, 0, 0), '#ec7063'], // Friday
      [new Date(2020, 0, 18, 12, 0, 0), '#af7ac5'], // Saturday
    ];

    for (const [lastModifiedDate, expectedLowercase] of cases) {
      expect(getInboxTileBackgroundColor(lastModifiedDate.getTime(), now)).toBe(
        expectedLowercase,
      );
    }
  });
});
