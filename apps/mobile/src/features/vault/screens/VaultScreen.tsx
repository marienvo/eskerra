import {useFocusEffect} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useLayoutEffect} from 'react';
import {Box, Text, useColorMode} from '@gluestack-ui/themed';
import {StyleSheet, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {LIST_HORIZONTAL_INSET} from '../../../core/ui/listMetrics';
import {VaultStackParamList} from '../../../navigation/types';
import {NoteContentView} from '../components/NoteContentView';

type VaultScreenProps = StackScreenProps<VaultStackParamList, 'Vault'>;

export function VaultScreen({navigation, route}: VaultScreenProps) {
  const colorMode = useColorMode();
  const muted = colorMode === 'dark' ? '#cfcfcf' : '#616161';

  const noteUri = route.params?.noteUri?.trim();
  const noteTitle = route.params?.noteTitle?.trim();
  const showingNote = Boolean(noteUri);

  const isVaultTopRoute = useCallback((): boolean => {
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    return activeRoute?.name === 'Vault';
  }, [navigation]);

  const renderSearchHeaderRight = useCallback(
    () => (
      <TouchableOpacity
        accessibilityLabel="Search vault"
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => navigation.navigate('VaultSearch')}
        style={styles.headerIconButton}>
        <MaterialIcons color="#ffffff" name="search" size={24} />
      </TouchableOpacity>
    ),
    [navigation],
  );

  const renderNoteBackHeaderLeft = useCallback(
    () => (
      <TouchableOpacity
        accessibilityLabel="Close note"
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => {
          navigation.setParams({noteTitle: undefined, noteUri: undefined});
        }}
        style={styles.headerBackButton}>
        <MaterialIcons color="#ffffff" name="arrow-back" size={22} />
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

    if (showingNote) {
      tabNavigation.setOptions({
        headerLeft: renderNoteBackHeaderLeft,
        headerRight: renderSearchHeaderRight,
        headerTitle: noteTitle && noteTitle.length > 0 ? noteTitle : 'Note',
      });
      return () => {
        tabNavigation.setOptions({
          headerLeft: undefined,
          headerRight: undefined,
          headerTitle: 'Today',
        });
      };
    }

    tabNavigation.setOptions({
      headerLeft: undefined,
      headerRight: renderSearchHeaderRight,
      headerTitle: 'Today',
    });
    return () => {
      tabNavigation.setOptions({
        headerLeft: undefined,
        headerRight: undefined,
        headerTitle: 'Today',
      });
    };
  }, [
    isVaultTopRoute,
    navigation,
    noteTitle,
    renderNoteBackHeaderLeft,
    renderSearchHeaderRight,
    showingNote,
  ]);

  useFocusEffect(
    useCallback(() => {
      const tabNavigation = navigation.getParent();
      if (!tabNavigation) {
        return;
      }

      const applyHeader = () => {
        if (!isVaultTopRoute()) {
          return;
        }
        tabNavigation.setOptions({
          headerShown: true,
          headerLeft: showingNote ? renderNoteBackHeaderLeft : undefined,
          headerRight: renderSearchHeaderRight,
          headerTitle:
            showingNote && noteTitle && noteTitle.length > 0 ? noteTitle : 'Today',
        });
      };

      applyHeader();
      const frameId = requestAnimationFrame(() => {
        applyHeader();
      });
      return () => cancelAnimationFrame(frameId);
    }, [
      isVaultTopRoute,
      navigation,
      noteTitle,
      renderNoteBackHeaderLeft,
      renderSearchHeaderRight,
      showingNote,
    ]),
  );

  return (
    <Box style={styles.container}>
      {showingNote && noteUri ? (
        <NoteContentView
          noteUri={noteUri}
          onNavigateToVaultNote={(uri, title) => {
            navigation.setParams({noteUri: uri, noteTitle: title});
          }}
        />
      ) : (
        <Text style={[styles.empty, {color: muted, paddingHorizontal: LIST_HORIZONTAL_INSET}]}>
          Open search to browse notes in this vault.
        </Text>
      )}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 24,
  },
  empty: {
    fontSize: 15,
    textAlign: 'center',
  },
  headerBackButton: {
    marginLeft: 12,
  },
  headerIconButton: {
    marginRight: 12,
  },
});
