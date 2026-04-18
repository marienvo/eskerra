import {splitYamlFrontmatter, stemFromMarkdownFileName} from '@eskerra/core';
import {vaultReadonlyLinkSchemeFromColorMode, vaultReadonlyMarkdownLinkColors} from '@eskerra/tokens';
import {Box, Text, useColorMode} from '@gluestack-ui/themed';
import {useCallback, useMemo, useState} from 'react';
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

export type VaultReadonlyMarkdownBlockProps = {
  noteUri: string;
  markdownFullText: string;
  onNavigateToVaultNote?: (noteUri: string, noteTitle: string) => void;
  sectionTitle?: string;
  emptyPlaceholder?: string;
  /** When the parent already shows a vault index warning, hide the duplicate per block. */
  omitWikiIndexWarning?: boolean;
};

function noteTitleFromUri(noteUri: string): string {
  const tail = normalizeNoteUri(noteUri).split('/').filter(Boolean).pop() ?? 'Note.md';
  return stemFromMarkdownFileName(tail);
}

export function VaultReadonlyMarkdownBlock({
  noteUri,
  markdownFullText,
  onNavigateToVaultNote,
  sectionTitle,
  emptyPlaceholder = '*Empty*',
  omitWikiIndexWarning = false,
}: VaultReadonlyMarkdownBlockProps) {
  const {baseUri} = useVaultContext();
  const colorMode = useColorMode();
  const {
    vaultMarkdownRefs,
    vaultMarkdownRefsError,
    vaultMarkdownRefsStatus,
    refreshVaultMarkdownRefs,
  } = useVaultMarkdownRefs();
  const [wikiPick, setWikiPick] = useState<VaultWikiAmbiguousPayload | null>(null);
  const markdownTextColor = colorMode === 'dark' ? '#f5f5f5' : '#212121';
  const markdownMutedColor = colorMode === 'dark' ? '#cfcfcf' : '#616161';
  const vaultLinkColors = useMemo(
    () => vaultReadonlyMarkdownLinkColors(vaultReadonlyLinkSchemeFromColorMode(colorMode)),
    [colorMode],
  );
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

  const wikiIndexStatus =
    vaultMarkdownRefsStatus === 'ready'
      ? 'ready'
      : vaultMarkdownRefsStatus === 'error'
        ? 'error'
        : 'loading';

  const vaultRules = useMemo(
    () =>
      createVaultReadonlyMarkdownRules({
        vaultRoot: baseUri,
        currentNoteUri: noteUri,
        noteRefs: vaultMarkdownRefs,
        markdownMutedColor,
        linkColors: vaultLinkColors,
        wikiIndexStatus,
        onRefreshWikiIndex: refreshVaultMarkdownRefs,
        onOpenInternalNote: openInternalNote,
        onWikiAmbiguous: setWikiPick,
      }),
    [
      baseUri,
      markdownMutedColor,
      noteUri,
      openInternalNote,
      refreshVaultMarkdownRefs,
      vaultLinkColors,
      vaultMarkdownRefs,
      wikiIndexStatus,
    ],
  );

  const markdownRules = useMemo(
    () => ({
      ...calloutRules,
      ...vaultRules,
    }),
    [calloutRules, vaultRules],
  );

  const {frontmatter, body} = splitYamlFrontmatter(markdownFullText);
  const markdownSource = frontmatter !== null ? body : markdownFullText;
  const markdownForDisplay =
    markdownSource.trim() === '' ? emptyPlaceholder : markdownSource;

  const preprocessedMarkdown = useMemo(
    () => preprocessVaultReadonlyMarkdownBody(markdownForDisplay),
    [markdownForDisplay],
  );

  return (
    <Box style={styles.block}>
      {sectionTitle ? (
        <Text accessibilityRole="header" style={[styles.sectionTitle, {color: markdownTextColor}]}>
          {sectionTitle}
        </Text>
      ) : null}
      {!omitWikiIndexWarning && vaultMarkdownRefsError ? (
        <Text style={[styles.indexWarning, {color: markdownMutedColor}]}>
          Link name index unavailable ({vaultMarkdownRefsError}). Wiki links may not resolve until
          the vault is reachable again.
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
      <WikiAmbiguousPickerModal
        accentLinkColor={vaultLinkColors.externalSite}
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
  block: {
    marginBottom: 20,
  },
  indexWarning: {
    fontSize: 12,
    marginBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
});
