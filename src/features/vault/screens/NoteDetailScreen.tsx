import {StackScreenProps} from '@react-navigation/stack';
import {useEffect, useState} from 'react';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {StyleSheet} from 'react-native';
import Markdown from 'react-native-markdown-display';

import {VaultStackParamList} from '../../../navigation/types';
import {useNotes} from '../hooks/useNotes';

type NoteDetailScreenProps = StackScreenProps<VaultStackParamList, 'NoteDetail'>;

export function NoteDetailScreen({navigation, route}: NoteDetailScreenProps) {
  const {read} = useNotes();
  const colorMode = useColorMode();
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const markdownTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const markdownMutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';

  useEffect(() => {
    const tabNavigation = navigation.getParent();
    if (!tabNavigation) {
      return;
    }

    const showVaultTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: true,
        headerLeft: undefined,
        headerTitle: 'Vault',
      });
    };

    const hideVaultTabHeader = () => {
      tabNavigation.setOptions({
        headerShown: false,
      });
    };

    const showNoteStackHeader = () => {
      navigation.setOptions({
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

    const unsubscribeBeforeRemove = navigation.addListener('beforeRemove', () => {
      hideNoteStackHeader();
      showVaultTabHeader();
    });

    return () => {
      unsubscribeTransitionEnd();
      unsubscribeTransitionStart();
      unsubscribeBeforeRemove();
      hideNoteStackHeader();
      showVaultTabHeader();
    };
  }, [navigation, route.params.noteTitle]);

  useEffect(() => {
    let isActive = true;

    const loadNote = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const note = await read(route.params.noteUri);

        if (!isActive) {
          return;
        }

        setContent(note.content);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        const fallbackMessage = 'Could not load this note.';
        setError(loadError instanceof Error ? loadError.message : fallbackMessage);
      } finally {
        if (isActive) {
          setIsLoading(false);
        }
      }
    };

    loadNote().catch(() => undefined);

    return () => {
      isActive = false;
    };
  }, [read, route.params.noteUri]);

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
});
