import {EditorState, Text} from '@codemirror/state';
import {describe, expect, it} from 'vitest';

import {
  wikiLinkActivatableInnerAtDocPosition,
  wikiLinkInnerAtDocPosition,
  wikiLinkMatchAtDocPosition,
  wikiLinkPointerActivatableInnerAtDocPosition,
} from './wikiLinkInnerAtDocPosition';

describe('wikiLinkInnerAtDocPosition', () => {
  it('returns inner when position is inside a wiki link on that line', () => {
    const doc = Text.of(['Before [[alpha note]] after']);
    const line = doc.line(1);
    const inside = line.from + line.text.indexOf('alpha');
    expect(wikiLinkInnerAtDocPosition(doc, inside)).toBe('alpha note');
  });

  it('matches EditorState.doc line-at for caret-style positions', () => {
    const state = EditorState.create({
      doc: 'x [[y]] z',
    });
    const pos = state.doc.toString().indexOf('y');
    expect(wikiLinkInnerAtDocPosition(state.doc, pos)).toBe('y');
  });

  it('returns null when position is outside any wiki link', () => {
    const doc = Text.of(['no link here']);
    expect(wikiLinkInnerAtDocPosition(doc, 3)).toBeNull();
  });

  it('returns absolute inner range for a match at doc position', () => {
    const doc = Text.of(['x [[first]]', 'y [[second|Label]] z']);
    const line = doc.line(2);
    const pos = line.from + line.text.indexOf('second');
    expect(wikiLinkMatchAtDocPosition(doc, pos)).toEqual({
      inner: 'second|Label',
      innerFrom: line.from + line.text.indexOf('second'),
      innerTo: line.from + line.text.indexOf(']]'),
    });
  });
});

describe('wikiLinkActivatableInnerAtDocPosition', () => {
  it('returns inner inside styled span and at caret slot before ]], not on [[ or between ]]', () => {
    const doc = Text.of(['Before [[alpha note]] after']);
    const line = doc.line(1);
    const firstBracket = line.from + line.text.indexOf('[[');
    const firstCloseInner = line.from + line.text.indexOf(']]');
    expect(wikiLinkActivatableInnerAtDocPosition(doc, firstBracket)).toBeNull();
    expect(wikiLinkActivatableInnerAtDocPosition(doc, firstBracket + 1)).toBeNull();
    expect(wikiLinkActivatableInnerAtDocPosition(doc, firstCloseInner)).toBe(
      'alpha note',
    );
    expect(wikiLinkActivatableInnerAtDocPosition(doc, firstCloseInner - 1)).toBe(
      'alpha note',
    );
    expect(wikiLinkActivatableInnerAtDocPosition(doc, firstCloseInner + 1)).toBeNull();
  });

  it('returns inner at start of wiki inner span', () => {
    const doc = Text.of(['x [[y]] z']);
    const line = doc.line(1);
    const innerStart = line.from + line.text.indexOf('y');
    expect(wikiLinkActivatableInnerAtDocPosition(doc, innerStart)).toBe('y');
  });
});

describe('wikiLinkPointerActivatableInnerAtDocPosition', () => {
  it('returns inner only strictly inside styled inner, not on first closing bracket', () => {
    const doc = Text.of(['Before [[alpha note]] after']);
    const line = doc.line(1);
    const firstCloseInner = line.from + line.text.indexOf(']]');
    expect(wikiLinkPointerActivatableInnerAtDocPosition(doc, firstCloseInner)).toBeNull();
    expect(
      wikiLinkPointerActivatableInnerAtDocPosition(doc, firstCloseInner - 1),
    ).toBe('alpha note');
    expect(wikiLinkActivatableInnerAtDocPosition(doc, firstCloseInner)).toBe(
      'alpha note',
    );
  });
});
