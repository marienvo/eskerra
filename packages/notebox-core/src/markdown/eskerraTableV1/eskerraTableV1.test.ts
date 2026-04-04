import {describe, expect, it} from 'vitest';

import {parseEskerraTableV1FromLines} from './parse';
import {serializeEskerraTableV1ToMarkdown} from './serialize';

describe('parseEskerraTableV1FromLines', () => {
  it('parses a valid v1 table with alignments', () => {
    const result = parseEskerraTableV1FromLines([
      '| Name | Score |',
      '| :--- | ---: |',
      '| Alice | 42 |',
      '| Bob | 9 |',
    ]);
    expect(result).toEqual({
      ok: true,
      lineCount: 4,
      model: {
        cells: [
          ['Name', 'Score'],
          ['Alice', '42'],
          ['Bob', '9'],
        ],
        align: ['left', 'right'],
      },
    });
  });

  it('fails closed for escaped pipes', () => {
    expect(
      parseEskerraTableV1FromLines([
        '| Name | Note |',
        '| --- | --- |',
        '| A | has \\| pipe |',
      ]),
    ).toEqual({ok: false, reason: 'unsupported_escaped_pipe'});
  });

  it('fails closed for invalid separator row syntax', () => {
    expect(
      parseEskerraTableV1FromLines([
        '| Name | Score |',
        '| -- | --- |',
      ]),
    ).toEqual({ok: false, reason: 'invalid_separator'});
  });

  it('accepts separator rows with extra hyphens (typical GFM / export style)', () => {
    const result = parseEskerraTableV1FromLines([
      '| File | Contents |',
      '|------|-----------|',
      '| [a](b) | Hello |',
    ]);
    expect(result).toEqual({
      ok: true,
      lineCount: 3,
      model: {
        cells: [
          ['File', 'Contents'],
          ['[a](b)', 'Hello'],
        ],
        align: [undefined, undefined],
      },
    });
  });

  it('fails closed for jagged rows', () => {
    expect(
      parseEskerraTableV1FromLines([
        '| Name | Score |',
        '| --- | --- |',
        '| Alice | 42 | extra |',
      ]),
    ).toEqual({ok: false, reason: 'column_mismatch'});
  });
});

describe('serializeEskerraTableV1ToMarkdown', () => {
  it('serializes deterministically with canonical separator formatting', () => {
    const markdown = serializeEskerraTableV1ToMarkdown({
      cells: [
        ['  Name  ', 'Score'],
        [' Alice ', '42'],
      ],
      align: ['left', 'right'],
    });
    expect(markdown).toBe(
      '| Name | Score |\n| :--- | ---: |\n| Alice | 42 |',
    );
  });

  it('round-trips parse+serialize+parse for v1 subset', () => {
    const input = [
      '| Title | Value |',
      '| :---: | --- |',
      '| One | 1 |',
      '| Two | 2 |',
    ];
    const parsed = parseEskerraTableV1FromLines(input);
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) {
      throw new Error('Expected parse to succeed');
    }

    const markdown = serializeEskerraTableV1ToMarkdown(parsed.model);
    const reparsed = parseEskerraTableV1FromLines(markdown.split('\n'));
    expect(reparsed).toEqual({
      ok: true,
      lineCount: 4,
      model: parsed.model,
    });
  });
});
