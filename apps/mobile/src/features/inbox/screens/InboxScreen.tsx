import type {NavigationProp} from '@react-navigation/native';
import {useFocusEffect} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useLayoutEffect, useRef, useState} from 'react';
import {
  Box,
  Pressable,
  Spinner,
  Text,
  useColorMode,
} from '@gluestack-ui/themed';
import {
  FlatList,
  RefreshControl,
  StyleSheet,
  TouchableOpacity,
  View,
} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {
  LIST_DIVIDER_DARK,
  LIST_DIVIDER_LIGHT,
  LIST_HORIZONTAL_INSET,
} from '../../../core/ui/listMetrics';
import {getNoteTitle} from '../../../core/storage/eskerraStorage';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {
  extractFirstMarkdownH1,
  formatRelativeCalendarLabel,
  getInboxTileBackgroundColor,
} from '@eskerra/core';
import {consumePendingShareDraft} from '../../../core/share/pendingShareDraft';
import {MainTabParamList, InboxStackParamList} from '../../../navigation/types';
import {useNotes} from '../../vault/hooks/useNotes';

type InboxScreenProps = StackScreenProps<InboxStackParamList, 'Inbox'>;

export function InboxScreen({navigation}: InboxScreenProps) {
  const {getInboxNoteContentFromCache} = useVaultContext();
  const {deleteNotes, error, isLoading, notes, refresh} = useNotes();
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [selectedNoteUris, setSelectedNoteUris] = useState<Set<string>>(new Set());
  const deleteInFlightRef = useRef(false);
  const colorMode = useColorMode();
  const dividerColor = colorMode === 'dark' ? LIST_DIVIDER_DARK : LIST_DIVIDER_LIGHT;
  const mutedTextColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const selectedCount = selectedNoteUris.size;
  const hasSelection = selectedCount > 0;
  const isInboxTopRoute = useCallback((): boolean => {
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    return activeRoute?.name === 'Inbox';
  }, [navigation]);

  const openNote = useCallback(
    (noteUri: string, noteName: string) => {
      const cached = getInboxNoteContentFromCache(noteUri);
      const fromH1 =
        cached !== undefined ? extractFirstMarkdownH1(cached) : null;
      const noteTitle = fromH1 ?? getNoteTitle(noteName);
      navigation.navigate('NoteDetail', {
        noteFileName: noteName,
        noteTitle,
        noteUri,
      });
    },
    [getInboxNoteContentFromCache, navigation],
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

  const renderSettingsHeaderRight = useCallback(
    () => (
      <TouchableOpacity
        accessibilityLabel="Settings"
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          const tabNavigation = navigation.getParent<NavigationProp<MainTabParamList>>();
          tabNavigation?.navigate('SettingsTab');
        }}
        style={styles.headerIconButton}>
        <MaterialIcons color="#ffffff" name="settings" size={24} />
      </TouchableOpacity>
    ),
    [navigation],
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
      const fallbackMessage = 'Could not delete selected entries.';
      setDeleteError(
        deleteNotesError instanceof Error ? deleteNotesError.message : fallbackMessage,
      );
    } finally {
      deleteInFlightRef.current = false;
      setIsDeleting(false);
    }
  }, [deleteNotes, isDeleting, notes, selectedNoteUris]);

  const renderSelectionHeaderRight = useCallback(
    () => (
      <TouchableOpacity
        disabled={isDeleting}
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          handleDeleteSelected().catch(() => undefined);
        }}
        style={styles.headerIconButton}>
        {isDeleting ? (
          <Spinner size="small" />
        ) : (
          <MaterialIcons color="#ffffff" name="delete-outline" size={24} />
        )}
      </TouchableOpacity>
    ),
    [handleDeleteSelected, isDeleting],
  );

  useLayoutEffect(() => {
    if (!isInboxTopRoute()) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    if (!hasSelection) {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: renderSettingsHeaderRight,
        headerTitle: 'Inbox',
      });
      return;
    }

    tabNavigation.setOptions({
      headerLeft: renderSelectionHeaderLeft,
      headerRight: renderSelectionHeaderRight,
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
    isInboxTopRoute,
    navigation,
    renderSettingsHeaderRight,
    renderSelectionHeaderLeft,
    renderSelectionHeaderRight,
    selectedCount,
  ]);

  useFocusEffect(
    useCallback(() => {
      const tabNavigation = navigation.getParent();
      if (!tabNavigation) {
        return;
      }

      const applyHeader = () => {
        if (!isInboxTopRoute()) {
          return;
        }
        tabNavigation.setOptions({
          headerShown: true,
          headerLeft: hasSelection ? renderSelectionHeaderLeft : undefined,
          headerRight: hasSelection ? renderSelectionHeaderRight : renderSettingsHeaderRight,
          headerTitle: hasSelection ? `${selectedCount} selected` : 'Inbox',
        });
      };

      applyHeader();
      const frameId = requestAnimationFrame(() => {
        applyHeader();
      });
      return () => cancelAnimationFrame(frameId);
    }, [
      hasSelection,
      isInboxTopRoute,
      navigation,
      renderSettingsHeaderRight,
      renderSelectionHeaderLeft,
      renderSelectionHeaderRight,
      selectedCount,
    ]),
  );

  useFocusEffect(
    useCallback(() => {
      const draft = consumePendingShareDraft();
      if (draft) {
        navigation.navigate('AddNote', {initialComposeText: draft});
      }
    }, [navigation]),
  );

  return (
    <Box style={styles.container}>
      {isLoading && notes.length === 0 ? (
        <Spinner style={styles.spinner} />
      ) : null}
      {deleteError ? <Text style={styles.status}>{deleteError}</Text> : null}
      {error ? <Text style={styles.status}>{error}</Text> : null}
      <FlatList
        contentContainerStyle={styles.listContent}
        data={notes}
        keyExtractor={item => item.uri}
        refreshControl={
          <RefreshControl
            onRefresh={refresh}
            refreshing={isLoading && notes.length > 0}
          />
        }
        renderItem={({index, item}) => {
          const cached = getInboxNoteContentFromCache(item.uri);
          const fromH1 =
            cached !== undefined ? extractFirstMarkdownH1(cached) : null;
          const listTitle = fromH1 ?? getNoteTitle(item.name);
          const isLast = index === notes.length - 1;

          return (
            <View
              style={[
                styles.noteRowOuter,
                {borderBottomColor: dividerColor},
                isLast ? styles.noteRowOuterLast : null,
              ]}>
              <View style={styles.noteRowInner}>
                <Pressable
                  disabled={isDeleting}
                  onPress={() => toggleNoteSelection(item.uri)}
                  style={[
                    styles.checkboxAvatar,
                    {
                      backgroundColor: getInboxTileBackgroundColor(item.lastModified),
                    },
                  ]}>
                  {selectedNoteUris.has(item.uri) ? (
                    <MaterialIcons color="#000000" name="check" size={28} />
                  ) : null}
                </Pressable>
                <Pressable
                  disabled={isDeleting}
                  onPress={() => openNote(item.uri, item.name)}
                  style={styles.noteContent}>
                  <Text style={styles.noteTitle}>{listTitle}</Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.noteFileName, {color: mutedTextColor}]}>
                    {item.name}
                  </Text>
                  <Text
                    numberOfLines={1}
                    style={[styles.noteMeta, {color: mutedTextColor}]}>
                    {formatRelativeCalendarLabel(item.lastModified)}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
        ListEmptyComponent={
          !isLoading ? (
            <Text style={styles.status}>
              No markdown entries found in Inbox. Add one via the Entry tab.
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
  },
  listContent: {
    paddingBottom: 20,
    paddingHorizontal: LIST_HORIZONTAL_INSET,
  },
  noteMeta: {
    fontSize: 12,
    marginTop: 4,
  },
  noteFileName: {
    fontSize: 12,
    marginTop: 4,
  },
  noteContent: {
    flex: 1,
  },
  noteRowOuter: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    marginHorizontal: -LIST_HORIZONTAL_INSET,
  },
  noteRowOuterLast: {
    borderBottomWidth: 0,
  },
  noteRowInner: {
    alignItems: 'center',
    flexDirection: 'row',
    paddingHorizontal: LIST_HORIZONTAL_INSET,
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
  headerBackButton: {
    marginLeft: 12,
  },
  headerIconButton: {
    marginRight: 12,
  },
  spinner: {
    marginVertical: 10,
  },
  status: {
    marginVertical: 10,
    paddingHorizontal: 20,
    textAlign: 'center',
  },
});
