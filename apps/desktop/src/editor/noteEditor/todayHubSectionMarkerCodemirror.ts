import {
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';

const SECTION_LINE_RX = /^\s*::today-section::\s*$/;

class TodayHubSectionDividerWidget extends WidgetType {
  eq(other: WidgetType): boolean {
    return other instanceof TodayHubSectionDividerWidget;
  }

  toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = 'cm-today-section-divider';
    wrap.setAttribute('aria-hidden', 'true');
    const dots = document.createElement('span');
    dots.className = 'cm-today-section-divider__dots';
    for (let i = 0; i < 3; i++) {
      const dot = document.createElement('span');
      dot.className = 'cm-today-section-divider__dot';
      dots.appendChild(dot);
    }
    wrap.appendChild(dots);
    return wrap;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function collectSelectionLineFroms(state: EditorState): Set<number> {
  const {doc, selection} = state;
  const lineFroms = new Set<number>();
  for (const r of selection.ranges) {
    const startLine = doc.lineAt(r.from);
    const endLine = doc.lineAt(Math.min(r.to, doc.length));
    for (let n = startLine.number; n <= endLine.number; n++) {
      lineFroms.add(doc.line(n).from);
    }
  }
  return lineFroms;
}

function buildTodayHubSectionDecorations(state: EditorState): DecorationSet {
  const {doc} = state;
  const revealedLineFroms = collectSelectionLineFroms(state);
  const ranges: Range<Decoration>[] = [];
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    if (!SECTION_LINE_RX.test(line.text)) {
      continue;
    }
    if (revealedLineFroms.has(line.from)) {
      continue;
    }
    ranges.push(
      Decoration.replace({
        widget: new TodayHubSectionDividerWidget(),
        block: true,
      }).range(line.from, line.to),
    );
  }
  return ranges.length ? Decoration.set(ranges, true) : Decoration.none;
}

/**
 * Renders `::today-section::` lines as a subtle three-dot divider widget.
 * When the caret (or any selection range) overlaps a section line, the raw
 * source is shown so it remains editable.
 *
 * Block-level replace/widget decorations must come from a StateField
 * (see {@link vaultImagePreviewCodemirror}).
 */
export const todayHubSectionMarkerExtension: Extension = StateField.define<DecorationSet>({
  create(state) {
    return buildTodayHubSectionDecorations(state);
  },
  update(value, tr) {
    if (!tr.docChanged && tr.selection === undefined) {
      return value;
    }
    return buildTodayHubSectionDecorations(tr.state);
  },
  provide: self => EditorView.decorations.from(self),
});
