import {describe, expect, it} from 'vitest';

import {planVaultFilesChangedEvent} from './vaultFilesChangedEventPlan';

function isPodcastRelevant(path: string): boolean {
  return path.endsWith('podcasts.md') || path.includes('/📻 ');
}

describe('planVaultFilesChangedEvent', () => {
  it('forces full reconcile when coarse is true even with non-empty paths', () => {
    const plan = planVaultFilesChangedEvent({
      payload: {
        paths: ['/vault/Inbox/note.md'],
        coarse: true,
        coarseReason: 'notify_error:poll:overflow',
      },
      isPodcastRelevantPath: isPodcastRelevant,
    });
    expect(plan.coarse).toBe(true);
    expect(plan.pathsForReconcile).toEqual([]);
    expect(plan.shouldTouchPathsIncrementally).toBe(false);
    expect(plan.shouldScheduleFullReindex).toBe(true);
  });

  it('can suppress repeated coarse full reindexes while preserving coarse reconcile', () => {
    const plan = planVaultFilesChangedEvent({
      payload: {
        paths: ['/vault/Inbox/note.md'],
        coarse: true,
        coarseReason: 'notify_error:recommended:overflow',
      },
      isPodcastRelevantPath: isPodcastRelevant,
      allowCoarseFullReindex: false,
    });
    expect(plan.coarse).toBe(true);
    expect(plan.pathsForReconcile).toEqual([]);
    expect(plan.shouldTouchPathsIncrementally).toBe(false);
    expect(plan.shouldScheduleFullReindex).toBe(false);
  });

  it('uses incremental path touch only for precise path batches', () => {
    const plan = planVaultFilesChangedEvent({
      payload: {paths: ['/vault/Inbox/note.md']},
      isPodcastRelevantPath: isPodcastRelevant,
    });
    expect(plan.coarse).toBe(false);
    expect(plan.pathsForReconcile).toEqual(['/vault/Inbox/note.md']);
    expect(plan.shouldTouchPathsIncrementally).toBe(true);
    expect(plan.shouldScheduleFullReindex).toBe(false);
  });

  it('refreshes podcast catalog on coarse invalidation', () => {
    const plan = planVaultFilesChangedEvent({
      payload: {
        paths: ['/vault/Inbox/unrelated.md'],
        coarse: true,
      },
      isPodcastRelevantPath: isPodcastRelevant,
    });
    expect(plan.shouldRefreshPodcasts).toBe(true);
  });

  it('refreshes podcast catalog on precise podcast path updates', () => {
    const plan = planVaultFilesChangedEvent({
      payload: {paths: ['/vault/General/2026 podcasts.md']},
      isPodcastRelevantPath: isPodcastRelevant,
    });
    expect(plan.shouldRefreshPodcasts).toBe(true);
  });
});
