import {matchCalloutHeader, resolveCallout, type CalloutColor} from '@eskerra/core';
import type {ReactNode} from 'react';
import React from 'react';
import {StyleSheet, Text, View, type ViewStyle} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

type MarkdownNode = {
  key: string;
  type: string;
  content?: string;
  children?: MarkdownNode[];
};

type ColorMode = 'light' | 'dark';

const CALLOUT_SURFACE: Record<ColorMode, Record<CalloutColor, {border: string; bg: string; title: string}>> = {
  light: {
    blue: {border: '#448aff', bg: 'rgba(68, 138, 255, 0.12)', title: '#1565c0'},
    cyan: {border: '#00bcd4', bg: 'rgba(0, 188, 212, 0.12)', title: '#00838f'},
    teal: {border: '#009688', bg: 'rgba(0, 150, 136, 0.12)', title: '#00695c'},
    green: {border: '#43a047', bg: 'rgba(67, 160, 71, 0.12)', title: '#2e7d32'},
    yellow: {border: '#fbc02d', bg: 'rgba(251, 192, 45, 0.18)', title: '#f57f17'},
    orange: {border: '#fb8c00', bg: 'rgba(251, 140, 0, 0.14)', title: '#e65100'},
    red: {border: '#e53935', bg: 'rgba(229, 57, 53, 0.12)', title: '#c62828'},
    purple: {border: '#8e24aa', bg: 'rgba(142, 36, 170, 0.12)', title: '#6a1b9a'},
    grey: {border: '#78909c', bg: 'rgba(120, 144, 156, 0.14)', title: '#455a64'},
  },
  dark: {
    blue: {border: '#64b5f6', bg: 'rgba(100, 181, 246, 0.14)', title: '#90caf9'},
    cyan: {border: '#4dd0e1', bg: 'rgba(77, 208, 225, 0.12)', title: '#80deea'},
    teal: {border: '#4db6ac', bg: 'rgba(77, 182, 172, 0.12)', title: '#80cbc4'},
    green: {border: '#81c784', bg: 'rgba(129, 199, 132, 0.12)', title: '#a5d6a7'},
    yellow: {border: '#ffd54f', bg: 'rgba(255, 213, 79, 0.14)', title: '#ffe082'},
    orange: {border: '#ffb74d', bg: 'rgba(255, 183, 77, 0.14)', title: '#ffcc80'},
    red: {border: '#e57373', bg: 'rgba(229, 115, 115, 0.14)', title: '#ffcdd2'},
    purple: {border: '#ba68c8', bg: 'rgba(186, 104, 200, 0.14)', title: '#e1bee7'},
    grey: {border: '#90a4ae', bg: 'rgba(144, 164, 174, 0.14)', title: '#cfd8dc'},
  },
};

function collectTextLeaves(n: MarkdownNode): string {
  if (n.type === 'text' && typeof n.content === 'string') {
    return n.content;
  }
  if (!n.children?.length) {
    return '';
  }
  return n.children.map(collectTextLeaves).join('');
}

function firstBlockquoteParagraphPlainText(node: MarkdownNode): string | null {
  const first = node.children?.[0];
  if (!first) {
    return null;
  }
  if (first.type === 'paragraph') {
    return collectTextLeaves(first);
  }
  /* Rare: blockquote starts with non-paragraph; treat whole first child as text-ish */
  return collectTextLeaves(first);
}

function tryMatchCalloutFromBlockquoteAst(node: MarkdownNode) {
  const raw = firstBlockquoteParagraphPlainText(node);
  if (raw == null) {
    return null;
  }
  const firstLine = raw.split('\n')[0] ?? '';
  return matchCalloutHeader(`> ${firstLine.trimStart()}`);
}

/**
 * Markdown `rules` override for `react-native-markdown-display` to render Obsidian/GitHub-style callouts.
 */
type MarkdownStyles = Record<string, ViewStyle | undefined> & {
  _VIEW_SAFE_blockquote?: ViewStyle;
  blockquote?: ViewStyle;
};

export function createCalloutMarkdownRules(
  colorMode: string,
): Record<string, (node: unknown, children: unknown, parent: unknown, styles: MarkdownStyles) => ReactNode> {
  const mode: ColorMode = colorMode === 'dark' ? 'dark' : 'light';

  return {
    blockquote: (node, children, _parent, styles) => {
      const astNode = node as unknown as MarkdownNode;
      const header = tryMatchCalloutFromBlockquoteAst(astNode);
      const baseBq = styles._VIEW_SAFE_blockquote ?? styles.blockquote;
      if (!header) {
        return (
          <View key={astNode.key} style={baseBq}>
            {children as ReactNode}
          </View>
        );
      }

      const meta = resolveCallout(header.rawType);
      const surface = CALLOUT_SURFACE[mode][meta.color];
      const titleText = header.title.trim() ? header.title.trim() : meta.label;
      const childArr = React.Children.toArray(children as ReactNode);
      const restChildren = childArr.slice(1);

      return (
        <View key={astNode.key} style={[baseBq, calloutChromeStyle(surface)]}>
          <View style={stylesCallout.headerRow}>
            <MaterialIcons color={surface.border} name={meta.icon} size={20} />
            <Text style={[stylesCallout.title, {color: surface.title}]}>{titleText}</Text>
          </View>
          {restChildren.length > 0 ? <View style={stylesCallout.body}>{restChildren}</View> : null}
        </View>
      );
    },
  };
}

const stylesCallout = StyleSheet.create({
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    flex: 1,
    flexWrap: 'wrap',
  },
  body: {
    paddingTop: 2,
  },
  calloutChrome: {
    borderLeftWidth: 3,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderRadius: 4,
  },
});

function calloutChromeStyle(surface: {border: string; bg: string}): ViewStyle {
  return {
    ...stylesCallout.calloutChrome,
    borderLeftColor: surface.border,
    backgroundColor: surface.bg,
  };
}
