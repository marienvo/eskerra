import type {TodayHubWeekProgress} from '../lib/todayHub';
import {todayHubWeekProgressSegments} from '../lib/todayHub';

const CELL_PX = 10;
const GAP_PX = 3;

type TodayWeekProgressBarProps = {
  progress: TodayHubWeekProgress;
  weekStart: Date;
  comparisonNow: Date;
};

/**
 * Week progress for the hub week window: past filled, today accent, future outline;
 * Sat–Sun one wide segment when they are consecutive in the strip.
 */
export function TodayWeekProgressBar({progress, weekStart, comparisonNow}: TodayWeekProgressBarProps) {
  const segments = todayHubWeekProgressSegments(
    progress,
    weekStart,
    comparisonNow,
    CELL_PX,
    GAP_PX,
  );
  const merged = segments.length === 6;

  let ariaLabel: string;
  if (progress.kind === 'past') {
    ariaLabel = merged
      ? 'Week complete, six segments (weekend as one block)'
      : 'Week complete, all 7 days passed';
  } else if (progress.kind === 'future') {
    ariaLabel = merged
      ? 'Upcoming week, six segments (weekend as one block)'
      : 'Upcoming week, no days started';
  } else {
    ariaLabel = merged
      ? `Day ${progress.dayIndex + 1} of 7, weekend shown as one block`
      : `Day ${progress.dayIndex + 1} of 7`;
  }

  return (
    <ul className="today-hub-canvas__week-progress" aria-label={ariaLabel}>
      {segments.map(seg => {
        const isWeekend = seg.dayIndex === null;
        const cellKind = seg.kind;
        return (
          <li
            key={seg.key}
            className={
              isWeekend
                ? `today-hub-canvas__week-progress-cell today-hub-canvas__week-progress-cell--weekend today-hub-canvas__week-progress-cell--${cellKind}`
                : `today-hub-canvas__week-progress-cell today-hub-canvas__week-progress-cell--${cellKind}`
            }
            aria-hidden="true"
          />
        );
      })}
    </ul>
  );
}
