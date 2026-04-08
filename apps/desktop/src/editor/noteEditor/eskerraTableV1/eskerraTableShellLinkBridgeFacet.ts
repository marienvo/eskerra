import {Facet} from '@codemirror/state';

import type {
  VaultRelativeMarkdownLinkActivatePayload,
  VaultWikiLinkActivatePayload,
} from '../vaultLinkActivatePayload';

export type EskerraTableShellLinkBridge = {
  onWikiLinkActivate: (payload: VaultWikiLinkActivatePayload) => void;
  onMarkdownRelativeLinkActivate: (
    payload: VaultRelativeMarkdownLinkActivatePayload,
  ) => void;
  onMarkdownExternalLinkOpen: (payload: {href: string; at: number}) => void;
};

/**
 * Parent note editor registers link handlers so inactive table cells can activate vault links
 * without mounting nested CodeMirror.
 */
export const eskerraTableShellLinkBridgeFacet =
  Facet.define<EskerraTableShellLinkBridge | null, EskerraTableShellLinkBridge | null>({
    combine(values) {
      for (let i = values.length - 1; i >= 0; i -= 1) {
        const v = values[i];
        if (v != null) {
          return v;
        }
      }
      return null;
    },
  });
