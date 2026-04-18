import type {TodayHubWeekProgress} from '../lib/todayHub';

type TodayWeekProgressBarProps = {
  progress: TodayHubWeekProgress;
};

/**
 * Seven cells for the local Mon–Sun (or hub-configured) week window: past filled, today accent, future empty.
 */
export function TodayWeekProgressBar({progress}: TodayWeekProgressBarProps) {
  const ariaLabel =
    progress.kind === 'past'
      ? 'Week complete, all 7 days passed'
      : progress.kind === 'future'
        ? 'Upcoming week, no days started'
        : `Day ${progress.dayIndex + 1} of 7`;

  return (
    <ul className="today-hub-canvas__week-progress" aria-label={ariaLabel}>
      {Array.from({length: 7}, (_, i) => {
        let cellKind: 'filled' | 'current' | 'empty' = 'empty';
        if (progress.kind === 'past') {
          cellKind = 'filled';
        } else if (progress.kind === 'future') {
          cellKind = 'empty';
        } else if (i < progress.dayIndex) {
          cellKind = 'filled';
        } else if (i === progress.dayIndex) {
          cellKind = 'current';
        } else {
          cellKind = 'empty';
        }
        return (
          <li
            key={i}
            className={`today-hub-canvas__week-progress-cell today-hub-canvas__week-progress-cell--${cellKind}`}
            aria-hidden="true"
          />
        );
      })}
    </ul>
  );
}
