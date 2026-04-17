import {expect, it} from 'vitest';

import * as Ds from './index';

it('exports public primitives', () => {
  expect(Ds.IconGlyph).toBeTypeOf('function');
  expect(Ds.DsButton).toBeTypeOf('function');
  expect(Ds.DsSurface).toBeTypeOf('function');
  expect(Ds.DsText).toBeTypeOf('function');
  expect(Ds.DsDivider).toBeTypeOf('function');
});
