import {
  isBrowserOpenableMarkdownHref,
  resolveInboxWikiLinkTarget,
  resolveVaultRelativeMarkdownHref,
  stemFromMarkdownFileName,
  wikiLinkInnerBrowserOpenableHref,
  wikiLinkInnerPathResolutionSourceDirectoryUri,
  wikiLinkInnerVaultRelativeMarkdownHref,
  type VaultMarkdownRef,
} from '@eskerra/core';
import type {VaultReadonlyMarkdownLinkColors} from '@eskerra/tokens';
import type {ReactNode} from 'react';
import React, {isValidElement} from 'react';
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

export type WikiIndexStatus = 'loading' | 'ready' | 'error';

export type VaultReadonlyMarkdownRuleOptions = {
  vaultRoot: string | null;
  currentNoteUri: string;
  noteRefs: readonly VaultMarkdownRef[];
  markdownMutedColor: string;
  /** Internal (note) vs external (browser) link hues — from `@eskerra/tokens` `vaultReadonlyMarkdownLinkColors`. */
  linkColors: VaultReadonlyMarkdownLinkColors;
  /** Wiki / relative `.md` resolution depends on vault-wide refs; not `ready` while indexing or after failure. */
  wikiIndexStatus: WikiIndexStatus;
  onRefreshWikiIndex: () => void;
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
      return options.linkColors.externalSite;
    }
    const resolved = resolveInboxWikiLinkTarget(options.noteRefs, wikiInner);
    if (resolved.kind === 'open' || resolved.kind === 'ambiguous') {
      return options.linkColors.internalNote;
    }
    if (resolved.kind === 'create' && options.wikiIndexStatus !== 'ready') {
      return options.linkColors.internalNote;
    }
    return options.markdownMutedColor;
  }

  if (isBrowserOpenableMarkdownHref(href)) {
    return options.linkColors.externalSite;
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
      return options.linkColors.internalNote;
    }
    if (options.wikiIndexStatus !== 'ready') {
      return options.linkColors.internalNote;
    }
  }

  return options.markdownMutedColor;
}

/**
 * `react-native-markdown-display` renders link labels as nested `<Text>` nodes that already carry
 * `color` from paragraph/body inherited styles. In RN, that inner `color` wins over the parent
 * link `Text`, so links look body-colored (e.g. white in dark mode). Force our link hue on the
 * whole subtree of `Text` elements.
 */
function withVaultReadonlyLinkTextColor(children: ReactNode, color: string): ReactNode {
  if (children == null || typeof children === 'string' || typeof children === 'number') {
    return children;
  }

  return React.Children.map(children, child => {
    if (!isValidElement(child)) {
      return child;
    }

    if (child.type === Text) {
      const prev = (child.props as {style?: object | object[] | undefined}).style;
      return React.cloneElement(child as React.ReactElement<{style?: object | object[]}>, {
        style: [prev, {color}],
      });
    }

    const nested = (child.props as {children?: ReactNode}).children;
    if (nested != null) {
      return React.cloneElement(child as React.ReactElement<{children?: ReactNode}>, {
        children: withVaultReadonlyLinkTextColor(nested, color),
      });
    }

    return child;
  });
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
    if (resolved.kind === 'unsupported') {
      if (resolved.reason === 'empty_target') {
        Alert.alert('Unsupported link', 'This wiki link has an empty target.');
        return;
      }
      const pathHref = wikiLinkInnerVaultRelativeMarkdownHref(wikiInner);
      const root = options.vaultRoot?.trim();
      if (pathHref != null && root) {
        const fallback = options.currentNoteUri;
        const vaultSource = wikiLinkInnerPathResolutionSourceDirectoryUri(
          root,
          wikiInner,
          fallback,
        );
        const norm = (u: string) => u.trim().replace(/\\/g, '/').toLowerCase();
        const sources =
          norm(vaultSource) === norm(fallback) ? [fallback] : [vaultSource, fallback];

        const resolveFrom = (sourceDir: string) =>
          resolveVaultRelativeMarkdownHref(root, sourceDir, pathHref, options.noteRefs);

        for (const sd of sources) {
          const rel = resolveFrom(sd);
          if (rel == null) {
            continue;
          }
          const inIndex = options.noteRefs.some(
            r => norm(r.uri) === norm(rel.uri),
          );
          if (inIndex) {
            options.onOpenInternalNote(rel.uri, vaultNoteTitleFromUri(rel.uri));
            return;
          }
        }
        for (const sd of sources) {
          const rel = resolveFrom(sd);
          if (rel != null) {
            options.onOpenInternalNote(rel.uri, vaultNoteTitleFromUri(rel.uri));
            return;
          }
        }
        Alert.alert(
          'Note not found',
          'This wiki link path does not match a note in this vault.',
        );
        return;
      }
      Alert.alert(
        'Unsupported link',
        'This wiki link uses a path target, which is not supported here.',
      );
      return;
    }
    if (resolved.kind === 'create') {
      if (options.wikiIndexStatus === 'loading') {
        Alert.alert('Still indexing vault', 'Try again in a moment once note names are indexed.');
        return;
      }
      if (options.wikiIndexStatus === 'error') {
        Alert.alert('Vault index unavailable', 'Could not build the note name index for wiki links.', [
          {text: 'Cancel', style: 'cancel'},
          {text: 'Retry', onPress: () => options.onRefreshWikiIndex()},
        ]);
        return;
      }
      Alert.alert('Note not found', 'This wiki link does not match a note in this vault.');
      return;
    }
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
    if (options.wikiIndexStatus === 'loading') {
      Alert.alert('Still indexing vault', 'Try again in a moment once note paths are indexed.');
      return;
    }
    if (options.wikiIndexStatus === 'error') {
      Alert.alert('Vault index unavailable', 'Could not build the note path index for internal links.', [
        {text: 'Cancel', style: 'cancel'},
        {text: 'Retry', onPress: () => options.onRefreshWikiIndex()},
      ]);
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
  const tintedChildren = withVaultReadonlyLinkTextColor(children, color);

  return (
    <Text
      key={node.key}
      accessibilityRole="link"
      onPress={() => handleLinkPress(href, options)}
      style={[baseStyle, {color}]}>
      {tintedChildren}
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
  /** Typically `linkColors.externalSite` (accent action on sheet). */
  accentLinkColor: string;
  onPick: (noteUri: string) => void;
  onClose: () => void;
}): ReactNode {
  const {visible, payload, colorMode, accentLinkColor, onPick, onClose} = props;
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
  const cancelColor = accentLinkColor;

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
