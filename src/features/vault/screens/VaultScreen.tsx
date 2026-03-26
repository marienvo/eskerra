import {StackScreenProps} from '@react-navigation/stack';
import {useFocusEffect} from '@react-navigation/native';
import {useCallback, useLayoutEffect, useMemo, useRef, useState} from 'react';
import {
  Box,
  Pressable,
  Spinner,
  Text,
  useColorMode,
} from '@gluestack-ui/themed';
import {FlatList, RefreshControl, StyleSheet, TouchableOpacity, View} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {getNoteTitle} from '../../../core/storage/noteboxStorage';
import {VaultStackParamList} from '../../../navigation/types';
import {useNotes} from '../hooks/useNotes';

type VaultScreenProps = StackScreenProps<VaultStackParamList, 'Vault'>;

export function VaultScreen({navigation}: VaultScreenProps) {
  const {deleteNotes, error, isLoading, notes, refresh} = useNotes();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedNoteUris, setSelectedNoteUris] = useState<Set<string>>(new Set());
  const deleteInFlightRef = useRef(false);
  const colorMode = useColorMode();
  const dividerColor = colorMode === 'dark' ? '#4f4f4f' : '#d6d6d6';
  const mutedTextColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const checkboxFillColor = colorMode === 'dark' ? '#4f4f4f' : '#e2e2e2';
  const actionBarBackgroundColor = colorMode === 'dark' ? '#1f1f1f' : '#ffffff';
  const selectedCount = selectedNoteUris.size;
  const hasSelection = selectedCount > 0;
  const listContentStyle = useMemo(
    () => [styles.listContent, hasSelection ? styles.listContentWithActionBar : null],
    [hasSelection],
  );
  const isVaultTopRoute = useCallback((): boolean => {
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    return activeRoute?.name === 'Vault';
  }, [navigation]);

  const openNote = useCallback(
    (noteUri: string, noteName: string) => {
      navigation.navigate('NoteDetail', {
        noteTitle: getNoteTitle(noteName),
        noteUri,
      });
    },
    [navigation],
  );

  const renderSelectionHeaderLeft = useCallback(
    () => (
      <TouchableOpacity
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          setDeleteError(null);
          setSelectedNoteUris(new Set());
        }}
        style={styles.headerBackButton}>
        <MaterialIcons color="#ffffff" name="arrow-back" size={22} />
      </TouchableOpacity>
    ),
    [],
  );

  const renderAddHeaderRight = useCallback(
    () => (
      <TouchableOpacity
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          navigation.navigate('AddNote');
        }}
        style={styles.headerAddButton}>
        <MaterialIcons color="#ffffff" name="add-box" size={24} />
      </TouchableOpacity>
    ),
    [navigation],
  );

  useLayoutEffect(() => {
    if (!isVaultTopRoute()) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    if (!hasSelection) {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: renderAddHeaderRight,
        headerTitle: 'Inbox',
      });
      return;
    }

    tabNavigation.setOptions({
      headerLeft: renderSelectionHeaderLeft,
      headerRight: undefined,
      headerTitle: `${selectedCount} selected`,
    });

    return () => {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Inbox',
      });
    };
  }, [
    hasSelection,
    isVaultTopRoute,
    navigation,
    renderAddHeaderRight,
    renderSelectionHeaderLeft,
    selectedCount,
  ]);

  useFocusEffect(
    useCallback(() => {
      if (!isVaultTopRoute()) {
        return;
      }
      const tabNavigation = navigation.getParent();
      if (!tabNavigation) {
        return;
      }

      tabNavigation.setOptions({
        headerShown: true,
        headerLeft: hasSelection ? renderSelectionHeaderLeft : undefined,
        headerRight: hasSelection ? undefined : renderAddHeaderRight,
        headerTitle: hasSelection ? `${selectedCount} selected` : 'Inbox',
      });
    }, [
      hasSelection,
      isVaultTopRoute,
      navigation,
      renderAddHeaderRight,
      renderSelectionHeaderLeft,
      selectedCount,
    ]),
  );

  const toggleNoteSelection = useCallback((noteUri: string) => {
    setDeleteError(null);
    setSelectedNoteUris(previousSelected => {
      const nextSelected = new Set(previousSelected);
      if (nextSelected.has(noteUri)) {
        nextSelected.delete(noteUri);
      } else {
        nextSelected.add(noteUri);
      }
      return nextSelected;
    });
  }, []);

  const handleDeleteSelected = useCallback(async () => {
    if (deleteInFlightRef.current || isDeleting) {
      return;
    }
    const selectedUris = Array.from(selectedNoteUris).filter(selectedUri =>
      notes.some(note => note.uri === selectedUri),
    );
    if (selectedUris.length === 0) {
      return;
    }

    setDeleteError(null);
    deleteInFlightRef.current = true;
    setIsDeleting(true);
    try {
      await deleteNotes(selectedUris);
      setSelectedNoteUris(new Set());
    } catch (deleteNotesError) {
      const fallbackMessage = 'Could not delete selected notes.';
      setDeleteError(
        deleteNotesError instanceof Error ? deleteNotesError.message : fallbackMessage,
      );
    } finally {
      deleteInFlightRef.current = false;
      setIsDeleting(false);
    }
  }, [deleteNotes, isDeleting, notes, selectedNoteUris]);

  return (
    <Box style={styles.container}>
      {isLoading && notes.length === 0 ? (
        <Spinner style={styles.spinner} />
      ) : null}
      {deleteError ? <Text style={styles.status}>{deleteError}</Text> : null}
      {error ? <Text style={styles.status}>{error}</Text> : null}
      <FlatList
        contentContainerStyle={listContentStyle}
        data={notes}
        keyExtractor={item => item.uri}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={isLoading && notes.length > 0}
          />
        }
        renderItem={({item}) => (
          <View style={[styles.noteRow, {borderBottomColor: dividerColor}]}>
            <Pressable
              disabled={isDeleting}
              onPress={() => toggleNoteSelection(item.uri)}
              style={[styles.checkboxAvatar, {backgroundColor: checkboxFillColor}]}>
              {selectedNoteUris.has(item.uri) ? (
                <MaterialIcons color="#1d7b3b" name="check" size={20} />
              ) : null}
            </Pressable>
            <Pressable
              disabled={isDeleting}
              onPress={() => openNote(item.uri, item.name)}
              style={styles.noteContent}>
              <Text style={styles.noteTitle}>{getNoteTitle(item.name)}</Text>
              <Text numberOfLines={1} style={[styles.noteMeta, {color: mutedTextColor}]}>
                {item.uri}
              </Text>
            </Pressable>
          </View>
        )}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.status}>
              No markdown notes found in Inbox. Add one from the Inbox tab.
            </Text>
          ) : null
        }
      />
      {hasSelection ? (
        <Box
          style={[
            styles.selectionActionBar,
            {
              backgroundColor: actionBarBackgroundColor,
              borderColor: dividerColor,
            },
          ]}>
          <Pressable
            disabled={isDeleting}
            onPress={() => {
              handleDeleteSelected().catch(() => undefined);
            }}
            style={styles.actionIconButton}>
            {isDeleting ? (
              <Spinner size="small" />
            ) : (
              <MaterialIcons color="#ffffff" name="delete-outline" size={24} />
            )}
          </Pressable>
        </Box>
      ) : null}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 0,
  },
  listContent: {
    paddingBottom: 20,
  },
  listContentWithActionBar: {
    paddingBottom: 88,
  },
  noteMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  noteContent: {
    flex: 1,
  },
  noteRow: {
    alignItems: 'center',
    borderBottomWidth: 1,
    flexDirection: 'row',
    paddingVertical: 12,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  checkboxAvatar: {
    alignItems: 'center',
    borderRadius: 8,
    height: 40,
    justifyContent: 'center',
    marginRight: 10,
    width: 40,
  },
  selectionActionBar: {
    alignItems: 'center',
    borderTopWidth: 1,
    bottom: 0,
    flexDirection: 'row',
    justifyContent: 'center',
    left: 0,
    paddingHorizontal: 20,
    paddingVertical: 12,
    position: 'absolute',
    right: 0,
    zIndex: 2,
    elevation: 2,
  },
  actionIconButton: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 36,
    minWidth: 36,
  },
  headerBackButton: {
    marginLeft: 12,
  },
  headerAddButton: {
    marginRight: 12,
  },
  spinner: {
    marginVertical: 10,
  },
  status: {
    marginVertical: 10,
    textAlign: 'center',
  },
});
