import {describe, expect, it} from 'vitest';

import {
  pickDocPosForLinkPrimaryClick,
  type LinkPointerDownSample,
} from './linkClickUseMousedownPosition';

const down = (partial: Partial<LinkPointerDownSample> & Pick<LinkPointerDownSample, 'pos'>):
  LinkPointerDownSample => ({
  x: 100,
  y: 200,
  timeStamp: 1000,
  ...partial,
});

describe('pickDocPosForLinkPrimaryClick', () => {
  it('returns atClick when down is missing', () => {
    expect(
      pickDocPosForLinkPrimaryClick(42, {
        timeStamp: 1100,
        clientX: 101,
        clientY: 201,
      }, undefined),
    ).toBe(42);
  });

  it('returns atClick when down.pos is null', () => {
    expect(
      pickDocPosForLinkPrimaryClick(
      42,
        {timeStamp: 1100, clientX: 101, clientY: 201},
        down({pos: null}),
      ),
    ).toBe(42);
  });

  it('prefers mousedown pos when movement is small and recent', () => {
    expect(
      pickDocPosForLinkPrimaryClick(
        49,
        {timeStamp: 1050, clientX: 103, clientY: 202},
        down({pos: 55, x: 100, y: 200, timeStamp: 1000}),
      ),
    ).toBe(55);
  });

  it('uses atClick when pointer moved beyond threshold', () => {
    expect(
      pickDocPosForLinkPrimaryClick(
        49,
        {timeStamp: 1050, clientX: 120, clientY: 200},
        down({pos: 55, x: 100, y: 200, timeStamp: 1000}),
      ),
    ).toBe(49);
  });

  it('uses atClick when click is older than mousedown timestamp', () => {
    expect(
      pickDocPosForLinkPrimaryClick(
        49,
        {timeStamp: 500, clientX: 101, clientY: 201},
        down({pos: 55, timeStamp: 1000}),
      ),
    ).toBe(49);
  });

  it('uses atClick when mousedown is too long ago', () => {
    expect(
      pickDocPosForLinkPrimaryClick(
        49,
        {timeStamp: 2000, clientX: 101, clientY: 201},
        down({pos: 55, timeStamp: 1000}),
      ),
    ).toBe(49);
  });
});
