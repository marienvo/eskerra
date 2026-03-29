import React from 'react';
import TestRenderer, {act} from 'react-test-renderer';
import {createPlaylistEtagPoller, type NoteboxSettings} from '@notebox/core';

import {usePlaylistR2ActivePolling} from '../src/features/podcasts/hooks/usePlaylistR2ActivePolling';

jest.mock('@notebox/core', () => {
  const actual = jest.requireActual('@notebox/core');
  return {
    ...actual,
    createPlaylistEtagPoller: jest.fn(),
  };
});

const createPlaylistEtagPollerMock = createPlaylistEtagPoller as jest.MockedFunction<
  typeof createPlaylistEtagPoller
>;

const vaultSettings: NoteboxSettings = {
  r2: {
    accessKeyId: 'kid',
    bucket: 'bucket',
    endpoint: 'https://example.r2.cloudflarestorage.com',
    secretAccessKey: 'secret',
  },
};

type HarnessProps = {
  allowPolling?: boolean;
  baseUri: string | null;
  settings: NoteboxSettings | null;
};

function Harness({allowPolling, baseUri, settings}: HarnessProps) {
  usePlaylistR2ActivePolling({
    allowPolling,
    baseUri,
    onRemotePlaylistUpdated: jest.fn(),
    settings,
  });
  return null;
}

describe('usePlaylistR2ActivePolling', () => {
  let setActive: jest.Mock;
  let dispose: jest.Mock;

  beforeEach(() => {
    jest.clearAllMocks();
    setActive = jest.fn();
    dispose = jest.fn();
    createPlaylistEtagPollerMock.mockReturnValue({
      dispose,
      getEtag: jest.fn(() => null),
      setActive,
      triggerCheck: jest.fn(),
    });
  });

  it('does not activate when R2 is not configured', async () => {
    await act(async () => {
      TestRenderer.create(<Harness allowPolling baseUri="content://vault" settings={{}} />);
    });
    expect(createPlaylistEtagPollerMock).toHaveBeenCalledTimes(1);
    expect(setActive).toHaveBeenCalledWith(false);
  });

  it('passes active false when allowPolling is false', async () => {
    let renderer!: TestRenderer.ReactTestRenderer;
    await act(async () => {
      renderer = TestRenderer.create(
        <Harness allowPolling baseUri="content://vault" settings={vaultSettings} />,
      );
    });
    setActive.mockClear();
    await act(async () => {
      renderer.update(
        <Harness allowPolling={false} baseUri="content://vault" settings={vaultSettings} />,
      );
    });
    expect(setActive).toHaveBeenCalledWith(false);
  });

  it('does not create a poller when baseUri is null', async () => {
    await act(async () => {
      TestRenderer.create(<Harness baseUri={null} settings={vaultSettings} />);
    });
    expect(createPlaylistEtagPollerMock).not.toHaveBeenCalled();
  });
});
