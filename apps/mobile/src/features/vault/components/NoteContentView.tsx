import {splitYamlFrontmatter, stemFromMarkdownFileName} from '@eskerra/core';
import {Box, ScrollView, Spinner, Text, useColorMode} from '@gluestack-ui/themed';
import {useCallback, useEffect, useMemo, useRef, useState} from 'react';
import {Alert, StyleSheet} from 'react-native';
import Markdown from 'react-native-markdown-display';

import {normalizeNoteUri} from '../../../core/storage/noteUriNormalize';
import {useVaultContext} from '../../../core/vault/VaultContext';
import {useVaultMarkdownRefs} from '../hooks/useVaultMarkdownRefs';
import {createCalloutMarkdownRules} from '../markdown/calloutRule';
import {
  createVaultReadonlyMarkdownRules,
  WikiAmbiguousPickerModal,
  type VaultWikiAmbiguousPayload,
} from '../markdown/vaultReadonlyMarkdownRules';
import {preprocessVaultReadonlyMarkdownBody} from '../markdown/vaultWikiLinkPreprocess';
import {useNotes} from '../hooks/useNotes';

export type NoteContentViewProps = {
  noteUri: string;
  /** When set, internal vault links navigate by updating the parent (e.g. Vault tab params). */
  onNavigateToVaultNote?: (noteUri: string, noteTitle: string) => void;
};

function fileNameFromUri(noteUri: string): string {
  const tail = normalizeNoteUri(noteUri).split('/').filter(Boolean).pop();
  return tail ?? 'Entry';
}

function noteTitleFromUri(noteUri: string): string {
  const tail = normalizeNoteUri(noteUri).split('/').filter(Boolean).pop() ?? 'Note.md';
  return stemFromMarkdownFileName(tail);
}

export function NoteContentView({noteUri, onNavigateToVaultNote}: NoteContentViewProps) {
  const {read} = useNotes();
  const {baseUri, getInboxNoteContentFromCache} = useVaultContext();
  const colorMode = useColorMode();
  const {
    vaultMarkdownRefs,
    isVaultMarkdownRefsLoading,
    vaultMarkdownRefsError,
  } = useVaultMarkdownRefs(baseUri);
  const headerFileName = fileNameFromUri(noteUri);
  const [content, setContent] = useState(
    () => getInboxNoteContentFromCache(noteUri) ?? '',
  );
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(
    () => getInboxNoteContentFromCache(noteUri) === undefined,
  );
  const [wikiPick, setWikiPick] = useState<VaultWikiAmbiguousPayload | null>(null);
  const hasLoadedNoteOnceRef = useRef(
    getInboxNoteContentFromCache(noteUri) !== undefined,
  );
  const markdownTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const markdownMutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const calloutRules = useMemo(() => createCalloutMarkdownRules(colorMode), [colorMode]);

  const openInternalNote = useCallback(
    (targetUri: string, title: string) => {
      if (onNavigateToVaultNote) {
        onNavigateToVaultNote(targetUri, title);
      } else {
        Alert.alert(
          'Navigation unavailable',
          'Linked notes can only be opened from the vault reader.',
        );
      }
    },
    [onNavigateToVaultNote],
  );

  const vaultRules = useMemo(
    () =>
      createVaultReadonlyMarkdownRules({
        vaultRoot: baseUri,
        currentNoteUri: noteUri,
        noteRefs: vaultMarkdownRefs,
        markdownMutedColor,
        onOpenInternalNote: openInternalNote,
        onWikiAmbiguous: setWikiPick,
      }),
    [baseUri, markdownMutedColor, noteUri, openInternalNote, vaultMarkdownRefs],
  );

  const markdownRules = useMemo(
    () => ({
      ...calloutRules,
      ...vaultRules,
    }),
    [calloutRules, vaultRules],
  );

  const noteText = content || '';
  const {frontmatter, body} = splitYamlFrontmatter(noteText);
  const markdownSource = frontmatter !== null ? body : noteText;
  const markdownForDisplay =
    markdownSource.trim() === '' ? '*Empty entry*' : markdownSource;

  const preprocessedMarkdown = useMemo(
    () => preprocessVaultReadonlyMarkdownBody(markdownForDisplay),
    [markdownForDisplay],
  );

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
        <ScrollView contentContainerStyle={styles.content} nestedScrollEnabled>
          <Text style={[styles.fileName, {color: markdownMutedColor}]}>{headerFileName}</Text>
          {vaultMarkdownRefsError ? (
            <Text style={[styles.indexWarning, {color: markdownMutedColor}]}>
              Link name index unavailable ({vaultMarkdownRefsError}). Wiki links may not resolve until
              the vault is reachable again.
            </Text>
          ) : null}
          {isVaultMarkdownRefsLoading && vaultMarkdownRefs.length === 0 ? (
            <Text style={[styles.indexHint, {color: markdownMutedColor}]}>
              Indexing vault notes for links…
            </Text>
          ) : null}
          <Markdown
            rules={markdownRules}
            style={{
              body: {color: markdownTextColor},
              code_block: {color: markdownTextColor},
              code_inline: {color: markdownTextColor},
              hr: {backgroundColor: markdownMutedColor},
              link: {textDecorationLine: 'underline'},
              paragraph: {color: markdownTextColor},
              th: {borderWidth: 1, borderColor: markdownMutedColor, flex: 0},
              td: {borderWidth: 1, borderColor: markdownMutedColor, flex: 0},
              tr: {borderBottomWidth: 1, borderColor: markdownMutedColor, flexDirection: 'row'},
              table: {borderWidth: 1, borderColor: markdownMutedColor, borderRadius: 3},
            }}>
            {preprocessedMarkdown}
          </Markdown>
        </ScrollView>
      ) : null}
      <WikiAmbiguousPickerModal
        colorMode={colorMode}
        payload={wikiPick}
        visible={wikiPick != null}
        onClose={() => setWikiPick(null)}
        onPick={uri => openInternalNote(uri, noteTitleFromUri(uri))}
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
  content: {
    paddingBottom: 24,
  },
  fileName: {
    fontSize: 12,
    marginBottom: 8,
  },
  indexHint: {
    fontSize: 12,
    marginBottom: 8,
  },
  indexWarning: {
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
