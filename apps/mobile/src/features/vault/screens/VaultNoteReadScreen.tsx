import {useFocusEffect} from '@react-navigation/native';
import {StackScreenProps} from '@react-navigation/stack';
import {useCallback, useLayoutEffect} from 'react';
import {Box} from '@gluestack-ui/themed';
import {StyleSheet, TouchableOpacity} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {VaultStackParamList} from '../../../navigation/types';
import {NoteContentView} from '../components/NoteContentView';

type VaultNoteReadScreenProps = StackScreenProps<VaultStackParamList, 'VaultNoteRead'>;

export function VaultNoteReadScreen({navigation, route}: VaultNoteReadScreenProps) {
  const noteUri = route.params.noteUri.trim();
  const noteTitle = route.params.noteTitle.trim();

  const isVaultNoteReadTopRoute = useCallback((): boolean => {
    const state = navigation.getState();
    const activeRoute = state.routes[state.index];
    return activeRoute?.name === 'VaultNoteRead';
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
        accessibilityLabel="Back to previous note"
        hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
        onPress={() => navigation.goBack()}
        style={styles.headerBackButton}>
        <MaterialIcons color="#ffffff" name="arrow-back" size={22} />
      </TouchableOpacity>
    ),
    [navigation],
  );

  useLayoutEffect(() => {
    if (!isVaultNoteReadTopRoute()) {
      return;
    }
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    tabNavigation.setOptions({
      headerLeft: renderNoteBackHeaderLeft,
      headerRight: renderSearchHeaderRight,
      headerTitle: noteTitle.length > 0 ? noteTitle : 'Note',
    });
  }, [
    isVaultNoteReadTopRoute,
    navigation,
    noteTitle,
    renderNoteBackHeaderLeft,
    renderSearchHeaderRight,
  ]);

  useFocusEffect(
    useCallback(() => {
      const tabNavigation = navigation.getParent();
      if (!tabNavigation) {
        return;
      }

      const applyHeader = () => {
        if (!isVaultNoteReadTopRoute()) {
          return;
        }
        tabNavigation.setOptions({
          headerShown: true,
          headerLeft: renderNoteBackHeaderLeft,
          headerRight: renderSearchHeaderRight,
          headerTitle: noteTitle.length > 0 ? noteTitle : 'Note',
        });
      };

      applyHeader();
      const frameId = requestAnimationFrame(() => {
        applyHeader();
      });
      return () => cancelAnimationFrame(frameId);
    }, [
      isVaultNoteReadTopRoute,
      navigation,
      noteTitle,
      renderNoteBackHeaderLeft,
      renderSearchHeaderRight,
    ]),
  );

  return (
    <Box style={styles.container}>
      <NoteContentView
        noteUri={noteUri}
        onNavigateToVaultNote={(uri, title) => {
          navigation.push('VaultNoteRead', {noteUri: uri, noteTitle: title});
        }}
      />
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingTop: 24,
  },
  headerBackButton: {
    marginLeft: 12,
  },
  headerIconButton: {
    marginRight: 12,
  },
});
