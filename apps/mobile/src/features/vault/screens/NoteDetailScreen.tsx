import {useFocusEffect} from '@react-navigation/native';
import type {StackHeaderRightProps} from '@react-navigation/stack';
import {StackScreenProps} from '@react-navigation/stack';
import {type ReactNode, useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {Pressable, StyleSheet} from 'react-native';
import Markdown from 'react-native-markdown-display';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {splitYamlFrontmatter} from '@eskerra/core';

import {normalizeNoteUri} from '../../../core/storage/noteUriNormalize';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {isNavigateToAddNoteAction} from '../../../navigation/navigationActionGuards';
import {InboxStackParamList} from '../../../navigation/types';
import {createCalloutMarkdownRules} from '../markdown/calloutRule';
import {useNotes} from '../hooks/useNotes';

type NoteDetailScreenProps = StackScreenProps<InboxStackParamList, 'NoteDetail'>;

function noteFileNameFromRoute(route: NoteDetailScreenProps['route']): string {
  if (route.params.noteFileName?.trim()) {
    return route.params.noteFileName.trim();
  }
  const tail = normalizeNoteUri(route.params.noteUri).split('/').filter(Boolean).pop();
  return tail ?? 'Entry';
}

type NoteDetailEditHeaderButtonProps = {
  onPress: () => void;
};

function NoteDetailEditHeaderButton({onPress}: NoteDetailEditHeaderButtonProps) {
  return (
    <Pressable
      accessibilityLabel="Edit entry"
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
  const {getInboxNoteContentFromCache} = useVaultContext();
  const colorMode = useColorMode();
  const headerFileName = noteFileNameFromRoute(route);
  const [content, setContent] = useState(
    () => getInboxNoteContentFromCache(route.params.noteUri) ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(
    () => getInboxNoteContentFromCache(route.params.noteUri) === undefined,
  );
  const hasLoadedNoteOnceRef = useRef(
    getInboxNoteContentFromCache(route.params.noteUri) !== undefined,
  );
  const markdownTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const markdownMutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const markdownCodeBg = colorMode === 'dark' ? 'rgba(255,255,255,0.08)' : '#f0f0f0';
  const markdownCodeBorder = colorMode === 'dark' ? 'rgba(255,255,255,0.12)' : '#cccccc';
  const calloutRules = useMemo(() => createCalloutMarkdownRules(colorMode), [colorMode]);

  const noteText = content || '';
  const {frontmatter, body} = splitYamlFrontmatter(noteText);
  const markdownSource = frontmatter !== null ? body : noteText;
  const markdownForDisplay =
    markdownSource.trim() === '' ? '*Empty entry*' : markdownSource;

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
      title: headerFileName,
    });
  }, [navigation, headerFileName, route.params.noteTitle, route.params.noteUri]);

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    const showInboxTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: true,
        headerLeft: undefined,
        headerTitle: 'Inbox',
      });
    };

    const hideInboxTabHeader = () => {
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
        title: headerFileName,
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
      hideInboxTabHeader();
      showNoteStackHeader();
    });

    const unsubscribeTransitionStart = navigation.addListener('transitionStart', event => {
      if (!event.data.closing) {
        return;
      }
      hideNoteStackHeader();
      showInboxTabHeader();
    });

    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', e => {
      hideNoteStackHeader();
      if (isNavigateToAddNoteAction(e.data.action)) {
        return;
      }
      showInboxTabHeader();
    });

    return () => {
      unsubscribeTransitionEnd();
      unsubscribeTransitionStart();
      unsubscribeBeforeRemove();
      hideNoteStackHeader();
      showInboxTabHeader();
    };
  }, [navigation, headerFileName, route.params.noteTitle, route.params.noteUri]);

  useFocusEffect(
    useCallback(() => {
      applyFocusedNoteHeaders();
    }, [applyFocusedNoteHeaders]),
  );

  useEffect(() => {
    const cached = getInboxNoteContentFromCache(route.params.noteUri);
    if (cached !== undefined) {
      setContent(cached);
      setIsLoading(false);
      hasLoadedNoteOnceRef.current = true;
    } else {
      setContent('');
      setIsLoading(true);
      hasLoadedNoteOnceRef.current = false;
    }
    setError(null);
  }, [getInboxNoteContentFromCache, route.params.noteUri]);

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

          const fallbackMessage = 'Could not load this entry.';
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
            rules={calloutRules}
            style={{
              body: {color: markdownTextColor},
              code_block: {color: markdownTextColor, backgroundColor: markdownCodeBg, borderColor: markdownCodeBorder},
              code_inline: {color: markdownTextColor, backgroundColor: markdownCodeBg, borderColor: markdownCodeBorder},
              fence: {color: markdownTextColor, backgroundColor: markdownCodeBg, borderColor: markdownCodeBorder},
              hr: {backgroundColor: markdownMutedColor},
              link: {color: '#4f9dff'},
              paragraph: {color: markdownTextColor},
            }}>
            {markdownForDisplay}
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
