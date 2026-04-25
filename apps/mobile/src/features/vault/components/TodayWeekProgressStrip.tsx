import type {TodayHubWeekProgress} from '@eskerra/core';
import {todayHubWeekProgressSegments} from '@eskerra/core';
import {vaultReadonlyLinkSchemeFromColorMode, vaultReadonlyMarkdownLinkColors} from '@eskerra/tokens';
import {useColorMode} from '@gluestack-ui/themed';
import {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

type TodayWeekProgressStripProps = {
  progress: TodayHubWeekProgress;
  weekStart: Date;
  /** Same clock used for `progress` (e.g. stable memo in parent). */
  comparisonNow: Date;
};

const CELL = 10;
const GAP = 3;

/**
 * Week progress: past filled, today accent, future outline; Sat–Sun one wide segment when adjacent in the hub week.
 */
export function TodayWeekProgressStrip({progress, weekStart, comparisonNow}: TodayWeekProgressStripProps) {
  const colorMode = useColorMode();
  const mutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const accentColor = useMemo(
    () => vaultReadonlyMarkdownLinkColors(vaultReadonlyLinkSchemeFromColorMode(colorMode)).externalSite,
    [colorMode],
  );
  const filledColor = colorMode === 'dark' ? 'rgba(245,245,245,0.45)' : 'rgba(33,33,33,0.45)';

  const segments = useMemo(
    () => todayHubWeekProgressSegments(progress, weekStart, comparisonNow, CELL, GAP),
    [comparisonNow, progress, weekStart],
  );

  const accessibilityLabel = useMemo(() => {
    const merged = segments.length === 6;
    if (progress.kind === 'past') {
      return merged ? 'Week complete, six segments (weekend as one block)' : 'Week complete, all 7 days passed';
    }
    if (progress.kind === 'future') {
      return merged
        ? 'Upcoming week, six segments (weekend as one block)'
        : 'Upcoming week, no days started';
    }
    return merged
      ? `Day ${progress.dayIndex + 1} of 7, weekend shown as one block`
      : `Day ${progress.dayIndex + 1} of 7`;
  }, [progress, segments.length]);

  return (
    <View accessibilityLabel={accessibilityLabel} accessible style={styles.row}>
      {segments.map(seg => {
        let base = [styles.cell, styles.cellEmpty, {borderColor: mutedColor, width: seg.widthPx}];
        if (seg.kind === 'filled') {
          base = [styles.cell, {backgroundColor: filledColor, width: seg.widthPx}];
        } else if (seg.kind === 'current') {
          base = [styles.cell, {backgroundColor: accentColor, width: seg.widthPx}];
        }
        return <View key={seg.key} style={base} />;
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: 2,
    height: CELL,
  },
  cellEmpty: {
    backgroundColor: 'transparent',
    borderWidth: 1,
  },
  row: {
    alignItems: 'center',
    flexDirection: 'row',
    flexShrink: 0,
    gap: GAP,
  },
});
