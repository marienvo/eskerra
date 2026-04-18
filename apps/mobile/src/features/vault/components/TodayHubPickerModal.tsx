import {todayHubFolderLabelFromTodayNoteUri} from '@eskerra/core';
import {Text} from '@gluestack-ui/themed';
import {type ReactNode} from 'react';
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

export type TodayHubPickerModalProps = {
  visible: boolean;
  hubs: readonly string[];
  activeUri: string | null;
  colorMode: string;
  onPick: (uri: string) => void;
  onClose: () => void;
};

export function TodayHubPickerModal(props: TodayHubPickerModalProps): ReactNode {
  const {visible, hubs, activeUri, colorMode, onPick, onClose} = props;
  if (!visible) {
    return null;
  }

  const isDark = colorMode === 'dark';
  const sheetBg = isDark ? '#1d1d1d' : '#fff';
  const titleColor = isDark ? '#f5f5f5' : '#111';
  const subtitleColor = isDark ? '#b0b0b0' : '#616161';
  const rowBorder = isDark ? '#333' : '#e0e0e0';
  const rowTitleColor = isDark ? '#f5f5f5' : '#111';
  const rowHintColor = isDark ? '#9e9e9e' : '#757575';
  const cancelColor = isDark ? '#90caf9' : '#1565c0';

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={[styles.sheet, {backgroundColor: sheetBg}]} onPress={e => e.stopPropagation()}>
          <Text style={[styles.title, {color: titleColor}]}>Today hub</Text>
          <Text style={[styles.subtitle, {color: subtitleColor}]}>Choose which hub to show.</Text>
          <ScrollView style={styles.list}>
            {hubs.map(uri => {
              const selected = activeUri != null && uri.replace(/\\/g, '/') === activeUri.replace(/\\/g, '/');
              const label = todayHubFolderLabelFromTodayNoteUri(uri);
              return (
                <Pressable
                  key={uri}
                  accessibilityRole="button"
                  accessibilityState={{selected}}
                  style={[styles.row, {borderBottomColor: rowBorder}]}
                  onPress={() => {
                    onPick(uri);
                    onClose();
                  }}>
                  <View style={styles.rowTextBlock}>
                    <Text style={[styles.rowTitle, {color: rowTitleColor}]}>{label}</Text>
                    <Text style={[styles.rowHint, {color: rowHintColor}]} numberOfLines={2}>
                      {uri}
                    </Text>
                  </View>
                  {selected ? (
                    <MaterialIcons color={rowTitleColor} name="check" size={22} />
                  ) : (
                    <View style={styles.checkPlaceholder} />
                  )}
                </Pressable>
              );
            })}
          </ScrollView>
          <Pressable accessibilityRole="button" style={styles.cancel} onPress={onClose}>
            <Text style={[styles.cancelText, {color: cancelColor}]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'flex-end',
    paddingBottom: 24,
    paddingHorizontal: 12,
  },
  sheet: {
    borderRadius: 12,
    maxHeight: '72%',
    paddingBottom: 8,
    paddingHorizontal: 16,
    paddingTop: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  list: {
    maxHeight: 400,
  },
  row: {
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    flexDirection: 'row',
    gap: 12,
    paddingVertical: 12,
  },
  rowTextBlock: {
    flex: 1,
    minWidth: 0,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowHint: {
    fontSize: 12,
    marginTop: 4,
  },
  checkPlaceholder: {
    height: 22,
    width: 22,
  },
  cancel: {
    alignItems: 'center',
    marginTop: 8,
    paddingVertical: 12,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
