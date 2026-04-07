import {
  completionStatus,
  selectedCompletion,
  startCompletion,
} from '@codemirror/autocomplete';
import {Compartment, EditorSelection, EditorState} from '@codemirror/state';
import {EditorView, runScopeHandlers} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import type {NoteInboxAttachmentHost} from '../../lib/noteInboxAttachmentHost';
import {
  buildNoteMarkdownCellExtensions,
  type NoteMarkdownCellEditorCallbacks,
} from './noteMarkdownCellEditor';

function mockAttachmentHost(): NoteInboxAttachmentHost {
  return {
    isVaultImageImportAvailable: false,
    importPastedImages: async () => [],
    readNativeClipboardPaste: async () => ({
      kind: 'fail',
      message: 'test',
    }),
    importDroppedFiles: async () => [],
    importDroppedAbsolutePaths: async () => [],
    subscribeWindowFileDragDrop: async () => () => {},
  };
}

function keydown(view: EditorView, key: string): void {
  runScopeHandlers(
    view,
    new KeyboardEvent('keydown', {key, bubbles: true}),
    'editor',
  );
}

function keydownModF(view: EditorView): void {
  runScopeHandlers(
    view,
    new KeyboardEvent('keydown', {key: 'f', ctrlKey: true, bubbles: true}),
    'editor',
  );
}

async function waitForSelectedCompletion(view: EditorView): Promise<void> {
  for (let i = 0; i < 200; i++) {
    if (selectedCompletion(view.state) != null) {
      return;
    }
    await new Promise<void>(r => {
      setTimeout(r, 5);
    });
  }
  throw new Error('completion did not become selectable');
}

describe('noteMarkdownCellEditor table keymap vs completion', () => {
  let view: EditorView | null = null;

  afterEach(() => {
    view?.destroy();
    view = null;
    document.body.replaceChildren();
  });

  it('Enter accepts wiki completion instead of running onEnterFromCell', async () => {
    let enterFromCellCalls = 0;
    const tableCallbacks: NoteMarkdownCellEditorCallbacks = {
      current: {
        onTabFromCell: () => false,
        onEnterFromCell: () => {
          enterFromCellCalls++;
          return true;
        },
        onEscapeFromCell: () => false,
      },
    };
    const wikiLinkCompartment = new Compartment();
    const relativeMdLinkCompartment = new Compartment();
    const extensions = buildNoteMarkdownCellExtensions({
      wikiLinkCompartment,
      relativeMdLinkCompartment,
      wikiLinkTargetIsResolved: () => false,
      relativeMarkdownLinkHrefIsResolved: () => false,
      wikiLinkCompletionCandidates: () => [
        {label: 'Alpha', insertTarget: 'Alpha', detail: 'Alpha.md'},
      ],
      vaultRootRef: {current: '/vault'},
      activeNotePathRef: {current: null},
      resolveVaultImagePreviewUrl: () => '',
      attachmentHostRef: {current: mockAttachmentHost()},
      busyRef: {current: false},
      onWikiLinkActivate: () => {},
      onMarkdownRelativeLinkActivate: () => {},
      onMarkdownExternalLinkOpen: () => {},
      onReportError: () => {},
      onDocChanged: () => {},
      tableCallbacks,
      pasteSessionRef: {current: 0},
      pasteSessionId: 0,
    });

    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '[[',
      selection: EditorSelection.cursor(2),
      extensions,
    });
    view = new EditorView({state, parent});

    expect(startCompletion(view!)).toBe(true);
    await waitForSelectedCompletion(view!);
    expect(completionStatus(view!.state)).not.toBeNull();

    // Default interactionDelay (75ms) blocks accept until elapsed.
    await new Promise<void>(r => {
      setTimeout(r, 80);
    });

    keydown(view!, 'Enter');
    expect(enterFromCellCalls).toBe(0);
    expect(view!.state.doc.toString()).toContain('Alpha');
  });

  it('Enter runs onEnterFromCell when completion is inactive', () => {
    let enterFromCellCalls = 0;
    const tableCallbacks: NoteMarkdownCellEditorCallbacks = {
      current: {
        onTabFromCell: () => false,
        onEnterFromCell: () => {
          enterFromCellCalls++;
          return true;
        },
        onEscapeFromCell: () => false,
      },
    };
    const wikiLinkCompartment = new Compartment();
    const relativeMdLinkCompartment = new Compartment();
    const extensions = buildNoteMarkdownCellExtensions({
      wikiLinkCompartment,
      relativeMdLinkCompartment,
      wikiLinkTargetIsResolved: () => false,
      relativeMarkdownLinkHrefIsResolved: () => false,
      wikiLinkCompletionCandidates: () => [
        {label: 'Alpha', insertTarget: 'Alpha', detail: 'Alpha.md'},
      ],
      vaultRootRef: {current: '/vault'},
      activeNotePathRef: {current: null},
      resolveVaultImagePreviewUrl: () => '',
      attachmentHostRef: {current: mockAttachmentHost()},
      busyRef: {current: false},
      onWikiLinkActivate: () => {},
      onMarkdownRelativeLinkActivate: () => {},
      onMarkdownExternalLinkOpen: () => {},
      onReportError: () => {},
      onDocChanged: () => {},
      tableCallbacks,
      pasteSessionRef: {current: 0},
      pasteSessionId: 0,
    });

    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'plain',
      selection: EditorSelection.cursor(5),
      extensions,
    });
    view = new EditorView({state, parent});

    expect(completionStatus(view!.state)).toBeNull();
    keydown(view!, 'Enter');
    expect(enterFromCellCalls).toBe(1);
  });

  it('Escape closes completion before onEscapeFromCell', async () => {
    let escapeFromCellCalls = 0;
    const tableCallbacks: NoteMarkdownCellEditorCallbacks = {
      current: {
        onTabFromCell: () => false,
        onEnterFromCell: () => false,
        onEscapeFromCell: () => {
          escapeFromCellCalls++;
          return true;
        },
      },
    };
    const wikiLinkCompartment = new Compartment();
    const relativeMdLinkCompartment = new Compartment();
    const extensions = buildNoteMarkdownCellExtensions({
      wikiLinkCompartment,
      relativeMdLinkCompartment,
      wikiLinkTargetIsResolved: () => false,
      relativeMarkdownLinkHrefIsResolved: () => false,
      wikiLinkCompletionCandidates: () => [
        {label: 'Alpha', insertTarget: 'Alpha', detail: 'Alpha.md'},
      ],
      vaultRootRef: {current: '/vault'},
      activeNotePathRef: {current: null},
      resolveVaultImagePreviewUrl: () => '',
      attachmentHostRef: {current: mockAttachmentHost()},
      busyRef: {current: false},
      onWikiLinkActivate: () => {},
      onMarkdownRelativeLinkActivate: () => {},
      onMarkdownExternalLinkOpen: () => {},
      onReportError: () => {},
      onDocChanged: () => {},
      tableCallbacks,
      pasteSessionRef: {current: 0},
      pasteSessionId: 0,
    });

    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: '[[',
      selection: EditorSelection.cursor(2),
      extensions,
    });
    view = new EditorView({state, parent});

    expect(startCompletion(view!)).toBe(true);
    await Promise.resolve();
    expect(completionStatus(view!.state)).not.toBeNull();

    keydown(view!, 'Escape');
    expect(escapeFromCellCalls).toBe(0);
    expect(completionStatus(view!.state)).toBeNull();

    keydown(view!, 'Escape');
    expect(escapeFromCellCalls).toBe(1);
  });

  it('Mod-f runs onOpenNoteWideFind when provided', () => {
    let wideFindCalls = 0;
    const tableCallbacks: NoteMarkdownCellEditorCallbacks = {
      current: {
        onTabFromCell: () => false,
        onEnterFromCell: () => false,
        onEscapeFromCell: () => false,
      },
    };
    const wikiLinkCompartment = new Compartment();
    const relativeMdLinkCompartment = new Compartment();
    const extensions = buildNoteMarkdownCellExtensions({
      wikiLinkCompartment,
      relativeMdLinkCompartment,
      wikiLinkTargetIsResolved: () => false,
      relativeMarkdownLinkHrefIsResolved: () => false,
      wikiLinkCompletionCandidates: () => [],
      vaultRootRef: {current: '/vault'},
      activeNotePathRef: {current: null},
      resolveVaultImagePreviewUrl: () => '',
      attachmentHostRef: {current: mockAttachmentHost()},
      busyRef: {current: false},
      onWikiLinkActivate: () => {},
      onMarkdownRelativeLinkActivate: () => {},
      onMarkdownExternalLinkOpen: () => {},
      onReportError: () => {},
      onDocChanged: () => {},
      tableCallbacks,
      pasteSessionRef: {current: 0},
      pasteSessionId: 0,
      onOpenNoteWideFind: () => {
        wideFindCalls++;
      },
    });

    const parent = document.createElement('div');
    document.body.append(parent);
    const state = EditorState.create({
      doc: 'x',
      selection: EditorSelection.cursor(1),
      extensions,
    });
    view = new EditorView({state, parent});

    keydownModF(view!);
    expect(wideFindCalls).toBe(1);
  });
});
