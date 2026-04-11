import {EditorState} from '@codemirror/state';
import {EditorView} from '@codemirror/view';
import {afterEach, describe, expect, it} from 'vitest';

import {
  clearEskerraTableNestedCellRegistrations,
  dispatchEskerraTableNestedCellEditors,
  registerEskerraTableNestedCellEditor,
} from './eskerraTableNestedCellEditors';

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

  it('dispatchEskerraTableNestedCellEditors skips disconnected nested views', () => {
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
    expect(() =>
      dispatchEskerraTableNestedCellEditors(parent, {}),
    ).not.toThrow();
    parent.destroy();
  });
});
