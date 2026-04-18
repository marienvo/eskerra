import type {TodayHubWeekProgress} from '@eskerra/core';
import {vaultReadonlyLinkSchemeFromColorMode, vaultReadonlyMarkdownLinkColors} from '@eskerra/tokens';
import {useColorMode} from '@gluestack-ui/themed';
import {useMemo} from 'react';
import {StyleSheet, View} from 'react-native';

type TodayWeekProgressStripProps = {
  progress: TodayHubWeekProgress;
};

const CELL = 10;
const GAP = 3;

/**
 * Seven cells for the hub week window: past filled, today accent, future outline.
 */
export function TodayWeekProgressStrip({progress}: TodayWeekProgressStripProps) {
  const colorMode = useColorMode();
  const mutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const accentColor = useMemo(
    () => vaultReadonlyMarkdownLinkColors(vaultReadonlyLinkSchemeFromColorMode(colorMode)).externalSite,
    [colorMode],
  );
  const filledColor = colorMode === 'dark' ? 'rgba(245,245,245,0.45)' : 'rgba(33,33,33,0.45)';

  const cells = useMemo(() => {
    return Array.from({length: 7}, (_, i) => {
      if (progress.kind === 'past') {
        return {i, style: [styles.cell, {backgroundColor: filledColor}]} as const;
      }
      if (progress.kind === 'future') {
        return {
          i,
          style: [styles.cell, styles.cellEmpty, {borderColor: mutedColor}],
        } as const;
      }
      if (i < progress.dayIndex) {
        return {i, style: [styles.cell, {backgroundColor: filledColor}]} as const;
      }
      if (i === progress.dayIndex) {
        return {i, style: [styles.cell, {backgroundColor: accentColor}]} as const;
      }
      return {
        i,
        style: [styles.cell, styles.cellEmpty, {borderColor: mutedColor}],
      } as const;
    });
  }, [accentColor, filledColor, mutedColor, progress]);

  const accessibilityLabel =
    progress.kind === 'past'
      ? 'Week complete, all 7 days passed'
      : progress.kind === 'future'
        ? 'Upcoming week, no days started'
        : `Day ${progress.dayIndex + 1} of 7`;

  return (
    <View accessibilityLabel={accessibilityLabel} accessible style={styles.row}>
      {cells.map(({i, style}) => (
        <View key={i} style={style} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  cell: {
    borderRadius: 2,
    height: CELL,
    width: CELL,
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
