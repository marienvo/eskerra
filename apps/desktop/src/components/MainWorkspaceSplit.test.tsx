import {render} from '@testing-library/react';
import {useLayoutEffect} from 'react';
import {describe, expect, it, vi, beforeEach} from 'vitest';

import {MainWorkspaceSplit} from './MainWorkspaceSplit';

let editorSubtreeMountCount = 0;

function EditorMountProbe() {
  useLayoutEffect(() => {
    editorSubtreeMountCount += 1;
  }, []);
  return <div data-testid="editor-probe" />;
}

describe('MainWorkspaceSplit', () => {
  beforeEach(() => {
    editorSubtreeMountCount = 0;
  });

  it('keeps editorPane subtree mounted when toggling vault with episodes hidden', () => {
    const onVaultWidthPxChanged = vi.fn();
    const onEpisodesWidthPxChanged = vi.fn();
    const onStackTopHeightPxChanged = vi.fn();

    const {rerender} = render(
      <MainWorkspaceSplit
        vaultVisible={false}
        episodesVisible={false}
        vaultWidthPx={280}
        episodesWidthPx={300}
        onVaultWidthPxChanged={onVaultWidthPxChanged}
        onEpisodesWidthPxChanged={onEpisodesWidthPxChanged}
        stackTopHeightPx={280}
        onStackTopHeightPxChanged={onStackTopHeightPxChanged}
        vaultPane={<div data-testid="vault-tree">tree</div>}
        episodesPane={<div data-testid="episodes">episodes</div>}
        editorPane={<EditorMountProbe />}
      />,
    );

    expect(editorSubtreeMountCount).toBe(1);
    expect(document.querySelector('[data-testid="vault-tree"]')).toBeNull();

    rerender(
      <MainWorkspaceSplit
        vaultVisible
        episodesVisible={false}
        vaultWidthPx={280}
        episodesWidthPx={300}
        onVaultWidthPxChanged={onVaultWidthPxChanged}
        onEpisodesWidthPxChanged={onEpisodesWidthPxChanged}
        stackTopHeightPx={280}
        onStackTopHeightPxChanged={onStackTopHeightPxChanged}
        vaultPane={<div data-testid="vault-tree">tree</div>}
        episodesPane={<div data-testid="episodes">episodes</div>}
        editorPane={<EditorMountProbe />}
      />,
    );

    expect(editorSubtreeMountCount).toBe(1);
    expect(document.querySelector('[data-testid="vault-tree"]')).not.toBeNull();

    rerender(
      <MainWorkspaceSplit
        vaultVisible={false}
        episodesVisible={false}
        vaultWidthPx={280}
        episodesWidthPx={300}
        onVaultWidthPxChanged={onVaultWidthPxChanged}
        onEpisodesWidthPxChanged={onEpisodesWidthPxChanged}
        stackTopHeightPx={280}
        onStackTopHeightPxChanged={onStackTopHeightPxChanged}
        vaultPane={<div data-testid="vault-tree">tree</div>}
        episodesPane={<div data-testid="episodes">episodes</div>}
        editorPane={<EditorMountProbe />}
      />,
    );

    expect(editorSubtreeMountCount).toBe(1);
    expect(document.querySelector('[data-testid="vault-tree"]')).toBeNull();
  });
});
