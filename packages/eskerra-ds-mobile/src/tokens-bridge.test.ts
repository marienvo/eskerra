import {expect, it} from 'vitest';

import {rnColors} from '@eskerra/tokens';

it('rnColors stays aligned with calm editorial accent', () => {
  expect(rnColors.accent).toBe('#4FAFE6');
});
