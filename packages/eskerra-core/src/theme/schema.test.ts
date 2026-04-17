import {describe, expect, it} from 'vitest';

import {parseThemeJson, ThemeLoadError, serializeVaultThemeJson} from './schema';

const validVaultBody = {
  name: 'Test',
  light: {palette: ['#F5F8FB']},
  dark: {palette: ['#031226', '#11538C']},
};

describe('parseThemeJson', () => {
  it('parses vault theme from file name stem', () => {
    const t = parseThemeJson(JSON.stringify(validVaultBody), {
      source: 'vault',
      fileName: 'ocean-breeze.json',
    });
    expect(t.id).toBe('ocean-breeze');
    expect(t.name).toBe('Test');
    expect(t.source).toBe('vault');
    expect(t.fileName).toBe('ocean-breeze.json');
  });

  it('rejects id mismatch with file stem', () => {
    expect(() =>
      parseThemeJson(JSON.stringify({...validVaultBody, id: 'other'}), {
        source: 'vault',
        fileName: 'ocean-breeze.json',
      }),
    ).toThrow(ThemeLoadError);
  });

  it('parses bundled with explicit id', () => {
    const t = parseThemeJson(
      JSON.stringify({
        id: 'eskerra-default',
        name: 'Eskerra Default',
        light: {palette: ['#ffffff']},
        dark: {palette: ['#000000']},
      }),
      {source: 'bundled'},
    );
    expect(t.id).toBe('eskerra-default');
    expect(t.source).toBe('bundled');
  });

  it('rejects invalid hex', () => {
    expect(() =>
      parseThemeJson(
        JSON.stringify({
          name: 'X',
          light: {palette: ['#GGGGGG']},
          dark: {palette: ['#000000']},
        }),
        {source: 'vault', fileName: 'x.json'},
      ),
    ).toThrow(ThemeLoadError);
  });
});

describe('serializeVaultThemeJson', () => {
  it('round-trips name and palettes', () => {
    const theme = parseThemeJson(JSON.stringify(validVaultBody), {
      source: 'vault',
      fileName: 't.json',
    });
    const raw = serializeVaultThemeJson(theme);
    const again = parseThemeJson(raw, {source: 'vault', fileName: 't.json'});
    expect(again.name).toBe(theme.name);
    expect([...again.light.palette]).toEqual([...theme.light.palette]);
  });
});
