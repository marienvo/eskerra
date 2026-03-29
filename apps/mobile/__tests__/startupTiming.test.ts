/**
 * @format
 */

import {elapsedMsSinceJsBundleEval} from '../src/core/observability/startupTiming';

describe('startupTiming', () => {
  test('elapsedMsSinceJsBundleEval returns a non-negative number', () => {
    const elapsed = elapsedMsSinceJsBundleEval();
    expect(typeof elapsed).toBe('number');
    expect(elapsed).toBeGreaterThanOrEqual(0);
  });
});
