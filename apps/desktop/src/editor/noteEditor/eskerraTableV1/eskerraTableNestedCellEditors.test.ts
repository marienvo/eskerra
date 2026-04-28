import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {
  clearEskerraTableNestedCellRegistrations,
  dispatchEskerraTableNestedCellEditors,
  registerEskerraTableNestedCellEditor,
} from './eskerraTableNestedCellEditors';

function waitMacrotask(): Promise<void> {
  return new Promise(resolve => {
    setTimeout(resolve, 0);
  });
}

describe('eskerraTableNestedCellEditors', () => {
  const hosts: HTMLDivElement[] = [];

  afterEach(() => {
    for (const h of hosts.splice(0)) {
      h.remove();
    }
  });

  it('clearEskerraTableNestedCellRegistrations removes nested targets', () => {
    const parentHost = document.createElement('div');
    const cellHost = document.createElement('div');
    hosts.push(parentHost, cellHost);
    document.body.append(parentHost, cellHost);

    const parent = new EditorView({
      parent: parentHost,
      state: EditorState.create({doc: 'p'}),
    });
    const cell = new EditorView({
      parent: cellHost,
      state: EditorState.create({doc: 'c'}),
    });
    const unreg = registerEskerraTableNestedCellEditor(parent, cell);
    clearEskerraTableNestedCellRegistrations(parent);
    expect(() =>
      dispatchEskerraTableNestedCellEditors(parent, {}),
    ).not.toThrow();
    unreg();
    parent.destroy();
    cell.destroy();
  });

  it('dispatchEskerraTableNestedCellEditors skips disconnected nested views', async () => {
    const parentHost = document.createElement('div');
    const cellHost = document.createElement('div');
    hosts.push(parentHost, cellHost);
    document.body.append(parentHost, cellHost);

    const parent = new EditorView({
      parent: parentHost,
      state: EditorState.create({doc: 'p'}),
    });
    const cell = new EditorView({
      parent: cellHost,
      state: EditorState.create({doc: 'c'}),
    });
    registerEskerraTableNestedCellEditor(parent, cell);
    cell.destroy();
    cellHost.remove();
    expect(() =>
      dispatchEskerraTableNestedCellEditors(parent, {}),
    ).not.toThrow();
    await waitMacrotask();
    expect(() =>
      dispatchEskerraTableNestedCellEditors(parent, {}),
    ).not.toThrow();
    await waitMacrotask();
    parent.destroy();
  });

  it('defers nested dispatch outside an active parent update', async () => {
    const parentHost = document.createElement('div');
    const cellHost = document.createElement('div');
    hosts.push(parentHost, cellHost);
    document.body.append(parentHost, cellHost);

    const cell = new EditorView({
      parent: cellHost,
      state: EditorState.create({doc: 'c'}),
    });
    let dispatchedFromParentUpdate = false;
    const parent = new EditorView({
      parent: parentHost,
      state: EditorState.create({
        doc: 'p',
        extensions: [
          EditorView.updateListener.of(() => {
            if (dispatchedFromParentUpdate) {
              return;
            }
            dispatchedFromParentUpdate = true;
            dispatchEskerraTableNestedCellEditors(parent, {
              changes: {from: 0, insert: 'x'},
            });
          }),
        ],
      }),
    });
    registerEskerraTableNestedCellEditor(parent, cell);

    expect(() => parent.dispatch({changes: {from: 0, insert: 'y'}})).not.toThrow();
    expect(cell.state.doc.toString()).toBe('c');
    await waitMacrotask();
    expect(cell.state.doc.toString()).toBe('xc');

    parent.destroy();
    cell.destroy();
  });
});
