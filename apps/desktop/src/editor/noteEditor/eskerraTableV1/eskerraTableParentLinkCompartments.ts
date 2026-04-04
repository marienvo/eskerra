import {Facet} from '@codemirror/state';
import type {Compartment} from '@codemirror/state';

export type EskerraTableParentLinkCompartments = {
  wikiLink: Compartment;
  relativeMarkdownLink: Compartment;
};

/**
 * Parent note editor registers its wiki / relative-link Compartment instances so
 * nested table cell editors share the same compartments: a single reconfigure
 * can be dispatched to the parent view and all cell views.
 */
export const eskerraTableParentLinkCompartmentsFacet = Facet.define<
  EskerraTableParentLinkCompartments | null,
  EskerraTableParentLinkCompartments | null
>({
  combine: xs => xs.find(x => x != null) ?? null,
});
