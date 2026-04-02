import {
  RangeSet,
  RangeSetBuilder,
  RangeValue,
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Text,
  type Transaction,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

import {parseLoneMarkdownImageLine} from './loneMarkdownImageLine';
import type {VaultImagePreviewRefs} from './vaultImagePreviewTypes';

export const toggleVaultImageExpand = StateEffect.define<{lineFrom: number}>();

export type {VaultImagePreviewRefs} from './vaultImagePreviewTypes';

/** Marker value for [`EditorView.atomicRanges`](https://codemirror.net/docs/ref/#view.EditorView^atomicRanges). */
class VaultImageAtomicSpan extends RangeValue {
  static readonly instance = new VaultImageAtomicSpan();

  eq(other: RangeValue): boolean {
    return other instanceof VaultImageAtomicSpan;
  }
}

function setsEqual(a: Set<number>, b: Set<number>): boolean {
  if (a.size !== b.size) {
    return false;
  }
  for (const x of a) {
    if (!b.has(x)) {
      return false;
    }
  }
  return true;
}

function filterValidExpandedLineStarts(doc: Text, positions: Set<number>): Set<number> {
  const out = new Set<number>();
  for (const pos of positions) {
    if (pos < 0 || pos > doc.length) {
      continue;
    }
    let line: {from: number; to: number};
    try {
      line = doc.lineAt(pos);
    } catch {
      continue;
    }
    if (line.from !== pos) {
      continue;
    }
    const parsed = parseLoneMarkdownImageLine(doc.sliceString(line.from, line.to));
    if (parsed) {
      out.add(pos);
    }
  }
  return out;
}

const vaultImageExpanded = StateField.define<Set<number>>({
  create: () => new Set(),
  update(set, tr) {
    if (!tr.docChanged && !tr.effects.some(e => e.is(toggleVaultImageExpand))) {
      return set;
    }

    let next: Set<number>;
    if (tr.docChanged) {
      next = new Set();
      for (const pos of set) {
        const mapped = tr.changes.mapPos(pos, -1);
        if (mapped !== null) {
          next.add(mapped);
        }
      }
    } else {
      next = new Set(set);
    }

    next = filterValidExpandedLineStarts(tr.state.doc, next);

    for (const e of tr.effects) {
      if (e.is(toggleVaultImageExpand)) {
        const {lineFrom} = e.value;
        const n = new Set(next);
        if (n.has(lineFrom)) {
          n.delete(lineFrom);
        } else {
          n.add(lineFrom);
        }
        next = filterValidExpandedLineStarts(tr.state.doc, n);
      }
    }

    return setsEqual(set, next) ? set : next;
  },
});

class VaultImageBlockWidget extends WidgetType {
  lineFrom: number;
  mode: 'collapsed' | 'trailing';
  alt: string;
  src: string;
  refs: VaultImagePreviewRefs;

  constructor(
    lineFrom: number,
    mode: 'collapsed' | 'trailing',
    alt: string,
    src: string,
    refs: VaultImagePreviewRefs,
  ) {
    super();
    this.lineFrom = lineFrom;
    this.mode = mode;
    this.alt = alt;
    this.src = src;
    this.refs = refs;
  }

  eq(other: WidgetType): boolean {
    return (
      other instanceof VaultImageBlockWidget &&
      this.lineFrom === other.lineFrom &&
      this.mode === other.mode &&
      this.alt === other.alt &&
      this.src === other.src
    );
  }

  get estimatedHeight(): number {
    return 200;
  }

  toDOM(view: EditorView): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className =
      this.mode === 'trailing'
        ? 'cm-vault-image-preview cm-vault-image-preview--trailing'
        : 'cm-vault-image-preview';
    wrap.setAttribute('role', 'button');
    wrap.setAttribute('tabIndex', '0');
    wrap.setAttribute(
      'aria-label',
      this.mode === 'collapsed'
        ? 'Image preview, click to show markdown'
        : 'Image preview, click to hide markdown',
    );

    const img = document.createElement('img');
    img.alt = this.alt;
    img.className = 'cm-vault-image-preview__img';
    img.decoding = 'async';
    img.src = this.refs.resolvePreviewUrl(
      this.refs.vaultRoot.current,
      this.refs.activeNotePath.current,
      this.src,
    );

    const toggle = (e: Event) => {
      e.preventDefault();
      e.stopPropagation();
      view.dispatch({
        effects: toggleVaultImageExpand.of({lineFrom: this.lineFrom}),
      });
    };

    img.addEventListener('click', toggle);
    wrap.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ' ') {
        toggle(e);
      }
    });
    img.addEventListener('load', () => {
      view.requestMeasure();
    });

    wrap.appendChild(img);
    return wrap;
  }
}

type BuildResult = {
  decorations: DecorationSet;
  atomic: RangeSet<VaultImageAtomicSpan>;
};

function buildVaultImageDecorations(
  state: EditorState,
  refs: VaultImagePreviewRefs,
): BuildResult {
  const expanded = state.field(vaultImageExpanded);
  const doc = state.doc;
  const decoBuilder = new RangeSetBuilder<Decoration>();
  const atomicBuilder = new RangeSetBuilder<VaultImageAtomicSpan>();

  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const parsed = parseLoneMarkdownImageLine(doc.sliceString(line.from, line.to));
    if (!parsed) {
      continue;
    }

    const isExpanded = expanded.has(line.from);

    if (isExpanded) {
      decoBuilder.add(
        line.to,
        line.to,
        Decoration.widget({
          widget: new VaultImageBlockWidget(
            line.from,
            'trailing',
            parsed.alt,
            parsed.src,
            refs,
          ),
          block: true,
          side: 1,
        }),
      );
    } else {
      let to = line.to;
      if (to < doc.length && doc.sliceString(to, to + 1) === '\n') {
        to += 1;
      }
      decoBuilder.add(
        line.from,
        to,
        Decoration.replace({
          widget: new VaultImageBlockWidget(
            line.from,
            'collapsed',
            parsed.alt,
            parsed.src,
            refs,
          ),
          block: true,
        }),
      );
      atomicBuilder.add(line.from, to, VaultImageAtomicSpan.instance);
    }
  }

  return {
    decorations: decoBuilder.finish(),
    atomic: atomicBuilder.finish(),
  };
}

function transactionAffectsVaultImagePreview(tr: Transaction): boolean {
  return tr.docChanged || tr.effects.some(e => e.is(toggleVaultImageExpand));
}

/**
 * Block-level replace/widget decorations must come from a StateField
 * (`EditorView.decorations.from`), not from a ViewPlugin — otherwise CodeMirror throws
 * "Block decorations may not be specified via plugins".
 */
export function vaultImagePreviewExtension(refs: VaultImagePreviewRefs): readonly Extension[] {
  const vaultImagePreviewBuilt = StateField.define<BuildResult>({
    create(state) {
      return buildVaultImageDecorations(state, refs);
    },
    update(value, tr) {
      if (!transactionAffectsVaultImagePreview(tr)) {
        return value;
      }
      return buildVaultImageDecorations(tr.state, refs);
    },
    provide: self => [
      EditorView.decorations.from(self, v => v.decorations),
      EditorView.atomicRanges.of(view => view.state.field(self).atomic),
    ],
  });

  return [vaultImageExpanded, vaultImagePreviewBuilt];
}
