import {
  Compartment,
  EditorState,
  EditorSelection,
  type Extension,
} from '@codemirror/state';
import {drawSelection, EditorView} from '@codemirror/view';
import {describe, expect, it} from 'vitest';

import {eskerraTableCellBundleFacet} from './eskerraTableCellBundleFacet';
import {eskerraTableParentLinkCompartmentsFacet} from './eskerraTableParentLinkCompartments';
import {eskerraTableV1Extension} from './eskerraTableV1Codemirror';

function makeTable(name: string, cols: number): string {
  const header = `| ${Array.from({length: cols}, (_, i) => `${name}${i}`).join(' | ')} |`;
  const sep = `| ${Array.from({length: cols}, () => '---').join(' | ')} |`;
  const row = `| ${Array.from({length: cols}, () => 'x').join(' | ')} |`;
  return `${header}\n${sep}\n${row}\n`;
}

function doubleRaf(): Promise<void> {
  return new Promise(resolve => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => resolve());
    });
  });
}

function editorExtensions(): readonly Extension[] {
  const wikiLink = new Compartment();
  const relativeMarkdownLink = new Compartment();
  return [
    eskerraTableParentLinkCompartmentsFacet.of({
      wikiLink,
      relativeMarkdownLink,
    }),
    eskerraTableCellBundleFacet.of(() => [drawSelection(), EditorView.lineWrapping]),
    ...eskerraTableV1Extension(),
  ];
}

describe('eskerra table shell focus', () => {
  it('renders one shell widget per Eskerra table (not only the primary)', async () => {
    const t1 = makeTable('A', 2);
    const t2 = makeTable('B', 2);
    const md = `${t1}\n\nBetween\n\n${t2}\n`;
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);

    const state = EditorState.create({
      doc: md,
      selection: EditorSelection.cursor(0),
      extensions: editorExtensions(),
    });
    const view = new EditorView({state, parent: parentEl});
    await doubleRaf();
    await doubleRaf();
    const roots = parentEl.querySelectorAll('.cm-eskerra-table-shell-root');
    expect(roots.length).toBe(2);
    view.destroy();
    parentEl.remove();
  });

  it('keeps parent editor focused when opening a note with caret before the first table', async () => {
    const tableMd = makeTable('T', 2);
    const md = `Line before table\n\n${tableMd}`;
    const parent = document.createElement('div');
    document.body.append(parent);

    const state = EditorState.create({
      doc: md,
      selection: EditorSelection.cursor(0),
      extensions: editorExtensions(),
    });
    const view = new EditorView({state, parent});
    view.focus();
    await doubleRaf();
    await doubleRaf();
    expect(view.hasFocus).toBe(true);
  });

  it('focuses nested cell editor when caret starts inside the open table', async () => {
    const tableMd = makeTable('T', 2);
    const prefix = `Line before table\n\n`;
    const md = `${prefix}${tableMd}`;
    const parent = document.createElement('div');
    document.body.append(parent);

    const anchorInTable = prefix.length + 4;
    const state = EditorState.create({
      doc: md,
      selection: EditorSelection.cursor(anchorInTable),
      extensions: editorExtensions(),
    });
    const view = new EditorView({state, parent});
    view.focus();
    await doubleRaf();
    await doubleRaf();
    const nestedContent = parent.querySelector(
      '.cm-eskerra-table-shell__cm-host .cm-content',
    );
    expect(nestedContent).toBeTruthy();
    const nestedView = EditorView.findFromDOM(nestedContent as HTMLElement);
    expect(nestedView).toBeTruthy();
    expect(nestedView!.hasFocus).toBe(true);
    expect(view.hasFocus).toBe(false);
  });

  it('mounts one nested CodeMirror host; other cells are static placeholders', async () => {
    const tableMd = makeTable('T', 2);
    const md = `${tableMd}`;
    const parentEl = document.createElement('div');
    document.body.append(parentEl);

    const anchorInTable = 4;
    const state = EditorState.create({
      doc: md,
      selection: EditorSelection.cursor(anchorInTable),
      extensions: editorExtensions(),
    });
    const view = new EditorView({state, parent: parentEl});
    view.focus();
    await doubleRaf();
    await doubleRaf();
    const hosts = parentEl.querySelectorAll('.cm-eskerra-table-shell__cm-host');
    const staticCells = parentEl.querySelectorAll('.cm-eskerra-table-shell__cell-static');
    /* Header + body: 2×2 cells; only the active cell (0,0) mounts CodeMirror. */
    expect(hosts.length).toBe(1);
    expect(staticCells.length).toBe(3);
    const content = hosts[0]!.querySelector('.cm-content');
    expect(content).toBeTruthy();
    expect(EditorView.findFromDOM(content as HTMLElement)).toBeTruthy();
    for (const el of staticCells) {
      expect(el.querySelector('.cm-content')).toBeNull();
    }
  });

  it('mounts the table shell margin rail beside the grid', async () => {
    const tableMd = makeTable('T', 2);
    const md = `${tableMd}`;
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);

    const state = EditorState.create({
      doc: md,
      selection: EditorSelection.cursor(4),
      extensions: editorExtensions(),
    });
    const view = new EditorView({state, parent: parentEl});
    view.focus();
    await doubleRaf();
    await doubleRaf();
    const rowRail = parentEl.querySelector(
      '[aria-label="Row drag handles"]',
    );
    expect(rowRail).toBeTruthy();
    const rail = parentEl.querySelector('[aria-label="Table actions"]');
    expect(rail).toBeTruthy();
    const topBtns = rail?.querySelectorAll('.cm-eskerra-table__rail-top button');
    expect(topBtns?.length).toBe(1);
    expect(topBtns?.[0]?.getAttribute('aria-label')).toBe('Edit as Markdown');
    expect(rail?.querySelector('.cm-eskerra-table__rail-bottom')).toBeNull();
  });

  it('adds a new column from column handle context menu while keeping one CodeMirror host', async () => {
    const tableMd = makeTable('T', 2);
    const md = `${tableMd}`;
    const parentEl = document.createElement('div');
    document.body.appendChild(parentEl);

    const state = EditorState.create({
      doc: md,
      selection: EditorSelection.cursor(4),
      extensions: editorExtensions(),
    });
    const view = new EditorView({state, parent: parentEl});
    view.focus();
    await doubleRaf();
    await doubleRaf();
    const colHandle = parentEl.querySelector(
      '.cm-eskerra-table-shell__col-handle',
    );
    expect(colHandle).toBeTruthy();
    colHandle!.dispatchEvent(
      new MouseEvent('contextmenu', {
        bubbles: true,
        cancelable: true,
        button: 2,
      }),
    );
    await doubleRaf();
    await doubleRaf();
    const items = Array.from(document.body.querySelectorAll('[role="menuitem"]'));
    const addRight = items.find(item =>
      item.textContent?.includes('Add column to the right'),
    );
    expect(addRight).toBeTruthy();
    (addRight as HTMLElement).click();
    await doubleRaf();
    await doubleRaf();
    const hosts = parentEl.querySelectorAll('.cm-eskerra-table-shell__cm-host');
    const staticCells = parentEl.querySelectorAll('.cm-eskerra-table-shell__cell-static');
    expect(hosts.length).toBe(1);
    expect(staticCells.length).toBe(5);
  });
});
