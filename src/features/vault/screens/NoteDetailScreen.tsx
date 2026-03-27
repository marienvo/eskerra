import {useFocusEffect} from '@react-navigation/native';
import type {StackHeaderRightProps} from '@react-navigation/stack';
import {StackScreenProps} from '@react-navigation/stack';
import {type ReactNode, useCallback, useEffect, useRef, useState} from 'react';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {Pressable, StyleSheet} from 'react-native';
import Markdown from 'react-native-markdown-display';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {isNavigateToAddNoteAction} from '../../../navigation/navigationActionGuards';
import {VaultStackParamList} from '../../../navigation/types';
import {useNotes} from '../hooks/useNotes';

type NoteDetailScreenProps = StackScreenProps<VaultStackParamList, 'NoteDetail'>;

type NoteDetailEditHeaderButtonProps = {
  onPress: () => void;
};

function NoteDetailEditHeaderButton({onPress}: NoteDetailEditHeaderButtonProps) {
  return (
    <Pressable
      accessibilityLabel="Edit note"
      accessibilityRole="button"
      hitSlop={{bottom: 8, left: 8, right: 8, top: 8}}
      onPress={onPress}
      style={styles.headerEditButton}>
      <MaterialIcons color="#ffffff" name="edit-square" size={22} />
    </Pressable>
  );
}

function createNoteDetailHeaderRight(
  navigation: NoteDetailScreenProps['navigation'],
  noteTitle: string,
  noteUri: string,
): (props: StackHeaderRightProps) => ReactNode {
  return () => (
    <NoteDetailEditHeaderButton
      onPress={() =>
        navigation.navigate('AddNote', {
          noteTitle,
          noteUri,
        })
      }
    />
  );
}

export function NoteDetailScreen({navigation, route}: NoteDetailScreenProps) {
  const {read} = useNotes();
  const colorMode = useColorMode();
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedNoteOnceRef = useRef(false);
  const markdownTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const markdownMutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';

  const applyFocusedNoteHeaders = useCallback(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }
    tabNavigation.setOptions({
      headerShown: false,
    });
    navigation.setOptions({
      headerRight: createNoteDetailHeaderRight(
        navigation,
        route.params.noteTitle,
        route.params.noteUri,
      ),
      headerShown: true,
      title: route.params.noteTitle,
    });
  }, [navigation, route.params.noteTitle, route.params.noteUri]);

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    const showVaultTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: true,
        headerLeft: undefined,
        headerTitle: 'Inbox',
      });
    };

    const hideVaultTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: false,
      });
    };

    const showNoteStackHeader = () => {
      navigation.setOptions({
        headerRight: createNoteDetailHeaderRight(
          navigation,
          route.params.noteTitle,
          route.params.noteUri,
        ),
        headerShown: true,
        title: route.params.noteTitle,
      });
    };

    const hideNoteStackHeader = () => {
      navigation.setOptions({
        headerShown: false,
      });
    };

    const unsubscribeTransitionEnd = navigation.addListener('transitionEnd', event => {
      if (event.data.closing) {
        return;
      }
      hideVaultTabHeader();
      showNoteStackHeader();
    });

    const unsubscribeTransitionStart = navigation.addListener('transitionStart', event => {
      if (!event.data.closing) {
        return;
      }
      hideNoteStackHeader();
      showVaultTabHeader();
    });

    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', e => {
      hideNoteStackHeader();
      if (isNavigateToAddNoteAction(e.data.action)) {
        return;
      }
      showVaultTabHeader();
    });

    return () => {
      unsubscribeTransitionEnd();
      unsubscribeTransitionStart();
      unsubscribeBeforeRemove();
      hideNoteStackHeader();
      showVaultTabHeader();
    };
  }, [navigation, route.params.noteTitle, route.params.noteUri]);

  useFocusEffect(
    useCallback(() => {
      applyFocusedNoteHeaders();
    }, [applyFocusedNoteHeaders]),
  );

  useEffect(() => {
    hasLoadedNoteOnceRef.current = false;
  }, [route.params.noteUri]);

  useFocusEffect(
    useCallback(() => {
      let isActive = true;
      const silentReload = hasLoadedNoteOnceRef.current;

      const loadNote = async () => {
        if (!silentReload) {
          setIsLoading(true);
        }
        setError(null);
        try {
          const note = await read(route.params.noteUri);

          if (!isActive) {
            return;
          }

          setContent(note.content);
          hasLoadedNoteOnceRef.current = true;
        } catch (loadError) {
          if (!isActive) {
            return;
          }

          const fallbackMessage = 'Could not load this note.';
          setError(loadError instanceof Error ? loadError.message : fallbackMessage);
        } finally {
          if (isActive && !silentReload) {
            setIsLoading(false);
          }
        }
      };

      loadNote().catch(() => undefined);

      return () => {
        isActive = false;
      };
    }, [read, route.params.noteUri]),
  );

  return (
    <Box style={styles.container}>
      {isLoading ? <Spinner style={styles.spinner} /> : null}
      {error ? <Text style={styles.status}>{error}</Text> : null}
      {!isLoading && !error ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Markdown
            style={{
              body: {color: markdownTextColor},
              code_block: {color: markdownTextColor},
              code_inline: {color: markdownTextColor},
              hr: {backgroundColor: markdownMutedColor},
              link: {color: '#4f9dff'},
              paragraph: {color: markdownTextColor},
            }}>
            {content || '*Empty note*'}
          </Markdown>
        </ScrollView>
      ) : null}
    </Box>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 16,
  },
  content: {
    paddingBottom: 24,
  },
  spinner: {
    marginVertical: 10,
  },
  status: {
    marginVertical: 10,
    textAlign: 'center',
  },
  headerEditButton: {
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 4,
    minHeight: 48,
    minWidth: 48,
  },
});
