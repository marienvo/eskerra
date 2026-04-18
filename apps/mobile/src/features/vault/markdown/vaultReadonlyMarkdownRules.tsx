import {
  isBrowserOpenableMarkdownHref,
  resolveInboxWikiLinkTarget,
  resolveVaultRelativeMarkdownHref,
  stemFromMarkdownFileName,
  wikiLinkInnerBrowserOpenableHref,
  type VaultMarkdownRef,
} from '@eskerra/core';
import {calmEditorial, desktopBrand} from '@eskerra/tokens';
import type {ReactNode} from 'react';
import React from 'react';
import {
  Alert,
  Linking,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';

import {VAULT_READONLY_WIKI_LINK_SCHEME} from './vaultWikiLinkPreprocess';

type MarkdownStyles = Record<string, unknown> & {
  _VIEW_SAFE_table?: object;
  table?: object;
  link?: object;
  blocklink?: object;
};

function vaultNoteTitleFromUri(noteUri: string): string {
  const tail = noteUri.split('/').filter(Boolean).pop() ?? 'Note.md';
  return stemFromMarkdownFileName(tail);
}

function decodeWikiHref(href: string): string | null {
  if (!href.startsWith(VAULT_READONLY_WIKI_LINK_SCHEME)) {
    return null;
  }
  const raw = href.slice(VAULT_READONLY_WIKI_LINK_SCHEME.length);
  try {
    return decodeURIComponent(raw);
  } catch {
    return null;
  }
}

export type VaultWikiAmbiguousPayload = {
  candidates: readonly VaultMarkdownRef[];
  inner: string;
};

export type VaultReadonlyMarkdownRuleOptions = {
  vaultRoot: string | null;
  currentNoteUri: string;
  noteRefs: readonly VaultMarkdownRef[];
  markdownMutedColor: string;
  onOpenInternalNote: (noteUri: string, noteTitle: string) => void;
  onWikiAmbiguous: (payload: VaultWikiAmbiguousPayload) => void;
};

function linkTextColor(
  href: string,
  options: VaultReadonlyMarkdownRuleOptions,
): string {
  const wikiInner = decodeWikiHref(href);
  if (wikiInner != null) {
    const browser = wikiLinkInnerBrowserOpenableHref(wikiInner);
    if (browser != null) {
      return calmEditorial.accent;
    }
    const resolved = resolveInboxWikiLinkTarget(options.noteRefs, wikiInner);
    if (resolved.kind === 'open') {
      return desktopBrand.interactiveText;
    }
    return options.markdownMutedColor;
  }

  if (isBrowserOpenableMarkdownHref(href)) {
    return calmEditorial.accent;
  }

  const root = options.vaultRoot?.trim();
  if (root) {
    const rel = resolveVaultRelativeMarkdownHref(
      root,
      options.currentNoteUri,
      href,
      options.noteRefs,
    );
    if (rel != null) {
      return desktopBrand.interactiveText;
    }
  }

  return options.markdownMutedColor;
}

async function openExternalUrl(url: string): Promise<void> {
  const can = await Linking.canOpenURL(url).catch(() => false);
  if (!can) {
    Alert.alert('Cannot open link', 'This URL cannot be opened on this device.');
    return;
  }
  await Linking.openURL(url).catch(() => {
    Alert.alert('Cannot open link', 'Something went wrong while opening the URL.');
  });
}

function handleLinkPress(href: string, options: VaultReadonlyMarkdownRuleOptions): void {
  const wikiInner = decodeWikiHref(href);
  if (wikiInner != null) {
    const browser = wikiLinkInnerBrowserOpenableHref(wikiInner);
    if (browser != null) {
      openExternalUrl(browser).catch(() => undefined);
      return;
    }
    const resolved = resolveInboxWikiLinkTarget(options.noteRefs, wikiInner);
    if (resolved.kind === 'open') {
      options.onOpenInternalNote(
        resolved.note.uri,
        vaultNoteTitleFromUri(resolved.note.uri),
      );
      return;
    }
    if (resolved.kind === 'ambiguous') {
      options.onWikiAmbiguous({candidates: resolved.notes, inner: wikiInner});
      return;
    }
    Alert.alert('Note not found', 'This wiki link does not match a note in this vault.');
    return;
  }

  if (isBrowserOpenableMarkdownHref(href)) {
    openExternalUrl(href.trim()).catch(() => undefined);
    return;
  }

  const root = options.vaultRoot?.trim();
  if (root) {
    const rel = resolveVaultRelativeMarkdownHref(
      root,
      options.currentNoteUri,
      href,
      options.noteRefs,
    );
    if (rel != null) {
      options.onOpenInternalNote(rel.uri, vaultNoteTitleFromUri(rel.uri));
      return;
    }
  }

  Alert.alert('Link', 'This link cannot be opened from read-only view.');
}

function renderVaultReadonlyLink(
  node: {key: string; attributes?: {href?: string}},
  children: ReactNode,
  styles: MarkdownStyles,
  styleKey: 'link' | 'blocklink',
  options: VaultReadonlyMarkdownRuleOptions,
): ReactNode {
  const href = String(node.attributes?.href ?? '');
  const color = linkTextColor(href, options);
  const baseStyle = styles[styleKey] as object | undefined;

  return (
    <Text
      key={node.key}
      accessibilityRole="link"
      onPress={() => handleLinkPress(href, options)}
      style={[baseStyle, {color}]}>
      {children}
    </Text>
  );
}

/**
 * Markdown rules for read-only vault notes: internal vs external link colors, wiki + `.md` resolution,
 * and horizontally scrollable tables.
 */
export function createVaultReadonlyMarkdownRules(
  options: VaultReadonlyMarkdownRuleOptions,
): Record<
  string,
  (node: unknown, children: unknown, parent: unknown, styles: MarkdownStyles, onLinkPress?: unknown) => ReactNode
> {
  return {
    link: (node, children, _parent, styles) =>
      renderVaultReadonlyLink(
        node as {key: string; attributes?: {href?: string}},
        children as ReactNode,
        styles,
        'link',
        options,
      ),
    blocklink: (node, children, _parent, styles) =>
      renderVaultReadonlyLink(
        node as {key: string; attributes?: {href?: string}},
        children as ReactNode,
        styles,
        'blocklink',
        options,
      ),
    table: (node, children, _parent, styles) => {
      const ast = node as {key: string};
      const tableStyle = styles._VIEW_SAFE_table ?? styles.table;
      return (
        <ScrollView
          key={ast.key}
          horizontal
          nestedScrollEnabled
          showsHorizontalScrollIndicator
          style={stylesTable.horizontalScroll}>
          <View style={[tableStyle as object, stylesTable.tableColumn]}>{children as ReactNode}</View>
        </ScrollView>
      );
    },
    th: (node, children, _parent, styles) => (
      <View key={(node as {key: string}).key} style={[styles.th as object, stylesTable.cell]}>
        {children as ReactNode}
      </View>
    ),
    td: (node, children, _parent, styles) => (
      <View key={(node as {key: string}).key} style={[styles.td as object, stylesTable.cell]}>
        {children as ReactNode}
      </View>
    ),
  };
}

const stylesTable = StyleSheet.create({
  horizontalScroll: {
    marginVertical: 8,
    maxWidth: '100%',
  },
  tableColumn: {
    flexDirection: 'column',
  },
  cell: {
    minWidth: 96,
    maxWidth: 280,
    flex: 0,
  },
});

export function WikiAmbiguousPickerModal(props: {
  visible: boolean;
  payload: VaultWikiAmbiguousPayload | null;
  colorMode: string;
  onPick: (noteUri: string) => void;
  onClose: () => void;
}): ReactNode {
  const {visible, payload, colorMode, onPick, onClose} = props;
  if (!visible || payload == null) {
    return null;
  }

  const isDark = colorMode === 'dark';
  const sheetBg = isDark ? '#1e1e1e' : '#fff';
  const titleColor = isDark ? '#f5f5f5' : '#111';
  const subtitleColor = isDark ? '#b0b0b0' : '#616161';
  const rowBorder = isDark ? '#333' : '#e0e0e0';
  const rowTitleColor = isDark ? '#f5f5f5' : '#111';
  const rowUriColor = isDark ? '#9e9e9e' : '#757575';
  const cancelColor = calmEditorial.accent;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={onClose}>
      <Pressable style={modalStyles.backdrop} onPress={onClose}>
        <Pressable style={[modalStyles.sheet, {backgroundColor: sheetBg}]} onPress={e => e.stopPropagation()}>
          <Text style={[modalStyles.title, {color: titleColor}]}>Multiple matching notes</Text>
          <Text style={[modalStyles.subtitle, {color: subtitleColor}]}>
            Pick which note to open for this wiki link.
          </Text>
          <ScrollView style={modalStyles.list}>
            {payload.candidates.map(row => (
              <Pressable
                key={row.uri}
                accessibilityRole="button"
                style={[modalStyles.row, {borderBottomColor: rowBorder}]}
                onPress={() => {
                  onPick(row.uri);
                  onClose();
                }}>
                <Text style={[modalStyles.rowTitle, {color: rowTitleColor}]}>{row.name}</Text>
                <Text style={[modalStyles.rowUri, {color: rowUriColor}]} numberOfLines={2}>
                  {row.uri}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
          <Pressable accessibilityRole="button" style={modalStyles.cancel} onPress={onClose}>
            <Text style={[modalStyles.cancelText, {color: cancelColor}]}>Cancel</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const modalStyles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  sheet: {
    borderRadius: 12,
    padding: 16,
    maxHeight: '70%',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  subtitle: {
    fontSize: 14,
    marginBottom: 12,
  },
  list: {
    maxHeight: 360,
  },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowTitle: {
    fontSize: 16,
    fontWeight: '500',
  },
  rowUri: {
    fontSize: 12,
    marginTop: 4,
  },
  cancel: {
    marginTop: 12,
    alignSelf: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  cancelText: {
    fontSize: 16,
    fontWeight: '600',
  },
});
