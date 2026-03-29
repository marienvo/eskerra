/**
 * @format
 */

import {act, create} from 'react-test-renderer';
import {Text} from 'react-native';

import {usePodcastArtworkDisplayUri} from '../src/features/podcasts/hooks/usePodcastArtworkDisplayUri';

const mockEnsureLocalArtworkFileForDisplay = jest.fn();

jest.mock('../src/core/storage/androidPodcastArtworkCache', () => ({
  clearPodcastArtworkDisplayUriCacheForTesting: jest.fn(),
  ensureLocalArtworkFileForDisplay: (...args: unknown[]) =>
    mockEnsureLocalArtworkFileForDisplay(...args),
}));

function HookProbe({uri}: {uri: string | null}) {
  const display = usePodcastArtworkDisplayUri(uri);
  return <Text>{display ?? 'EMPTY'}</Text>;
}

describe('usePodcastArtworkDisplayUri', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns https URI on first paint', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(<HookProbe uri="https://example.com/a.png" />);
    });
    expect(tree!.root.findByType(Text).props.children).toBe(
      'https://example.com/a.png',
    );
  });

  test('returns internal file URI on first paint without calling native copy', () => {
    let tree: ReturnType<typeof create>;
    act(() => {
      tree = create(
        <HookProbe uri="file:///data/user/0/app/files/podcast-artwork-files/a/x.jpg" />,
      );
    });
    expect(tree!.root.findByType(Text).props.children).toBe(
      'file:///data/user/0/app/files/podcast-artwork-files/a/x.jpg',
    );
    expect(mockEnsureLocalArtworkFileForDisplay).not.toHaveBeenCalled();
  });

  test('resolves content URI via async copy helper', async () => {
    const doc =
      'content://com.android.externalstorage.documents/tree/primary/document/vault/x.jpg';
    mockEnsureLocalArtworkFileForDisplay.mockResolvedValue('file:///cache/x');

    let tree: ReturnType<typeof create>;
    await act(async () => {
      tree = create(<HookProbe uri={doc} />);
      await Promise.resolve();
    });

    expect(tree!.root.findByType(Text).props.children).toBe('file:///cache/x');
    expect(mockEnsureLocalArtworkFileForDisplay).toHaveBeenCalledWith(doc);
  });
});
