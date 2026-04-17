import {splitYamlFrontmatter} from '@eskerra/core';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {StyleSheet} from 'react-native';
import Markdown from 'react-native-markdown-display';

import {normalizeNoteUri} from '../../../core/storage/noteUriNormalize';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {createCalloutMarkdownRules} from '../markdown/calloutRule';
import {useNotes} from '../hooks/useNotes';

export type NoteContentViewProps = {
  noteUri: string;
};

function fileNameFromUri(noteUri: string): string {
  const tail = normalizeNoteUri(noteUri).split('/').filter(Boolean).pop();
  return tail ?? 'Entry';
}

export function NoteContentView({noteUri}: NoteContentViewProps) {
  const {read} = useNotes();
  const {getInboxNoteContentFromCache} = useVaultContext();
  const colorMode = useColorMode();
  const headerFileName = fileNameFromUri(noteUri);
  const [content, setContent] = useState(
    () => getInboxNoteContentFromCache(noteUri) ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(
    () => getInboxNoteContentFromCache(noteUri) === undefined,
  );
  const hasLoadedNoteOnceRef = useRef(
    getInboxNoteContentFromCache(noteUri) !== undefined,
  );
  const markdownTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const markdownMutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const calloutRules = useMemo(() => createCalloutMarkdownRules(colorMode), [colorMode]);

  const noteText = content || '';
  const {frontmatter, body} = splitYamlFrontmatter(noteText);
  const markdownSource = frontmatter !== null ? body : noteText;
  const markdownForDisplay =
    markdownSource.trim() === '' ? '*Empty entry*' : markdownSource;

  useEffect(() => {
    const cached = getInboxNoteContentFromCache(noteUri);
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
  }, [getInboxNoteContentFromCache, noteUri]);

  const loadNote = useCallback(async () => {
    const silentReload = hasLoadedNoteOnceRef.current;
    if (!silentReload) {
      setIsLoading(true);
    }
    setError(null);
    try {
      const note = await read(noteUri);
      setContent(note.content);
      hasLoadedNoteOnceRef.current = true;
    } catch (loadError) {
      const fallbackMessage = 'Could not load this entry.';
      setError(loadError instanceof Error ? loadError.message : fallbackMessage);
    } finally {
      if (!silentReload) {
        setIsLoading(false);
      }
    }
  }, [read, noteUri]);

  useEffect(() => {
    loadNote().catch(() => undefined);
  }, [loadNote]);

  return (
    <Box style={styles.container}>
      {isLoading ? <Spinner style={styles.spinner} /> : null}
      {error ? <Text style={styles.status}>{error}</Text> : null}
      {!isLoading && !error ? (
        <ScrollView contentContainerStyle={styles.content}>
          <Text style={[styles.fileName, {color: markdownMutedColor}]}>{headerFileName}</Text>
          <Markdown
            rules={calloutRules}
            style={{
              body: {color: markdownTextColor},
              code_block: {color: markdownTextColor},
              code_inline: {color: markdownTextColor},
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
  fileName: {
    fontSize: 12,
    marginBottom: 8,
  },
  spinner: {
    marginVertical: 10,
  },
  status: {
    marginVertical: 10,
    textAlign: 'center',
  },
});
