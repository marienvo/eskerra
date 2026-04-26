/**
 * Pure layout flags for a single Today hub grid cell (warm path, editing, empty readonly).
 * Keeps {@link TodayHubCanvas} row rendering shallow for lint/complexity budgets.
 */

export type TodayHubCanvasCellSurface = 'empty-readonly' | 'non-empty';

export function todayHubCanvasCellSurface(args: {
  editing: boolean;
  isWarm: boolean;
  chunkTrimmedLength: number;
}): TodayHubCanvasCellSurface {
  const chunkHasText = args.chunkTrimmedLength > 0;
  if (!args.editing && !args.isWarm && !chunkHasText) {
    return 'empty-readonly';
  }
  return 'non-empty';
}

export function todayHubCanvasCellWarmOrActive(editing: boolean, isWarm: boolean): boolean {
  return editing || isWarm;
}
