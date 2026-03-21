import {StackScreenProps} from '@react-navigation/stack';
import {useCallback} from 'react';
import {
  Box,
  Pressable,
  Spinner,
  Text,
  useColorMode,
} from '@gluestack-ui/themed';
import {FlatList, RefreshControl, StyleSheet} from 'react-native';

import {getNoteTitle} from '../../../core/storage/noteboxStorage';
import {VaultStackParamList} from '../../../navigation/types';
import {useNotes} from '../hooks/useNotes';

type VaultScreenProps = StackScreenProps<VaultStackParamList, 'Vault'>;

export function VaultScreen({navigation}: VaultScreenProps) {
  const {error, isLoading, notes, refresh} = useNotes();
  const colorMode = useColorMode();
  const dividerColor = colorMode === 'dark' ? '#4f4f4f' : '#d6d6d6';
  const mutedTextColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';

  const openNote = useCallback(
    (noteUri: string, noteName: string) => {
      navigation.navigate('NoteDetail', {
        noteTitle: getNoteTitle(noteName),
        noteUri,
      });
    },
    [navigation],
  );

  return (
    <Box style={styles.container}>
      <Text style={styles.title}>Vault</Text>
      <Box style={[styles.folderRow, {borderColor: dividerColor}]}>
        <Text style={[styles.folderLabel, {color: mutedTextColor}]}>Folder</Text>
        <Text style={styles.folderValue}>Inbox</Text>
      </Box>
      {isLoading && notes.length === 0 ? (
        <Spinner style={styles.spinner} />
      ) : null}
      {error ? <Text style={styles.status}>{error}</Text> : null}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={notes}
        keyExtractor={item => item.uri}
        refreshControl={
          <RefreshControl onRefresh={refresh} refreshing={isLoading} />
        }
        renderItem={({item}) => (
          <Pressable
            onPress={() => openNote(item.uri, item.name)}
            style={[styles.noteRow, {borderBottomColor: dividerColor}]}>
            <Text style={styles.noteTitle}>{getNoteTitle(item.name)}</Text>
            <Text numberOfLines={1} style={[styles.noteMeta, {color: mutedTextColor}]}>
              {item.uri}
            </Text>
          </Pressable>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.status}>
              No markdown notes found in Inbox. Add one from the Inbox tab.
            </Text>
          ) : null
        }
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  folderLabel: {
    fontSize: 12,
    textTransform: 'uppercase',
  },
  folderRow: {
    alignItems: 'center',
    borderRadius: 8,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 10,
    marginBottom: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  folderValue: {
    fontSize: 16,
    fontWeight: '600',
  },
  listContent: {
    paddingBottom: 20,
  },
  noteMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  noteRow: {
    borderBottomWidth: 1,
    paddingVertical: 12,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  spinner: {
    marginVertical: 10,
  },
  status: {
    marginVertical: 10,
    textAlign: 'center',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    marginBottom: 8,
    textAlign: 'center',
  },
});
