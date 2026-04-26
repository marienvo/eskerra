/**
 * @format
 */

import type {ComponentProps} from 'react';
import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {Image, Text as RNText} from 'react-native';

import {useVaultContext} from '../src/core/vault/VaultContext';
import {
  EpisodeRow,
} from '../src/features/podcasts/components/EpisodeRow';
import {SELECTED_ARTWORK_IMAGE_BLUR_RADIUS} from '../src/features/podcasts/components/episodeRowConstants';
import {usePodcastArtwork} from '../src/features/podcasts/hooks/usePodcastArtwork';
import {PodcastEpisode} from '../src/types';

jest.mock('react-native-vector-icons/MaterialIcons', () => {
  const {Text} = require('react-native');

  return function MaterialIconsMock({name}: {name: string}) {
    return <Text>{name}</Text>;
  };
});

jest.mock('../src/core/vault/VaultContext', () => ({
  useVaultContext: jest.fn(),
}));

jest.mock('../src/features/podcasts/hooks/usePodcastArtwork', () => ({
  usePodcastArtwork: jest.fn(),
}));

describe('EpisodeRow', () => {
  const useVaultContextMock = useVaultContext as jest.MockedFunction<
    typeof useVaultContext
  >;
  const usePodcastArtworkMock = usePodcastArtwork as jest.MockedFunction<
    typeof usePodcastArtwork
  >;
  const episode: PodcastEpisode = {
    date: '2026-03-22',
    id: 'episode-1',
    isListened: false,
    mp3Url: 'https://example.com/episode-1.mp3',
    rssFeedUrl: 'https://example.com/feed.xml',
    sectionTitle: 'News',
    seriesName: 'Daily Show',
    sourceFile: '2026 Daily Show - podcasts.md',
    title: 'Morning Update',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    useVaultContextMock.mockReturnValue({baseUri: 'content://notes'} as never);
  });

  function renderRow(overrides: Partial<ComponentProps<typeof EpisodeRow>> = {}): ReactTestRenderer {
    return create(
      <EpisodeRow
        activeEpisodeId={null}
        dividerColor="#cccccc"
        episode={episode}
        mutedTextColor="#666666"
        onPlayEpisode={jest.fn().mockResolvedValue(undefined)}
        onToggleSelect={jest.fn()}
        playbackTransportBusy={false}
        playbackState="paused"
        {...overrides}
      />,
    );
  }

  test('renders episode artwork when artworkUri is provided', async () => {
    let tree: ReactTestRenderer;
    usePodcastArtworkMock.mockReturnValue('https://example.com/artwork.png');

    await act(async () => {
      tree = renderRow();
    });

    const images = tree!.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toEqual({uri: 'https://example.com/artwork.png'});
    expect(images[0].props.blurRadius).toBe(0);
  });

  test('renders no image when artworkUri is not provided', async () => {
    let tree: ReactTestRenderer;
    usePodcastArtworkMock.mockReturnValue(null);

    await act(async () => {
      tree = renderRow();
    });

    const images = tree!.root.findAllByType(Image);
    expect(images).toHaveLength(0);
  });

  test('opts in to background artwork fetch', async () => {
    usePodcastArtworkMock.mockReturnValue(null);

    await act(async () => {
      renderRow();
    });

    expect(usePodcastArtworkMock).toHaveBeenCalledWith(
      'content://notes',
      episode.rssFeedUrl,
      expect.objectContaining({allowBackgroundFetch: true}),
    );
  });

  test('does not show tap-to-play hint while another episode is playing', async () => {
    let tree: ReactTestRenderer;
    usePodcastArtworkMock.mockReturnValue(null);

    await act(async () => {
      tree = renderRow({
        activeEpisodeId: 'other-episode',
        playbackState: 'playing',
      });
    });

    const textContent = tree!
      .root.findAllByType(RNText)
      .flatMap(node => {
        const ch = node.props.children;
        return typeof ch === 'string' ? [ch] : [];
      })
      .join('\n');
    expect(textContent.includes('Tap to play')).toBe(false);
  });

  test('shows check icon when selected', async () => {
    let tree: ReactTestRenderer;
    usePodcastArtworkMock.mockReturnValue('https://example.com/artwork.png');

    await act(async () => {
      tree = renderRow({isSelected: true});
    });

    const iconTexts = tree!.root
      .findAllByType(RNText)
      .filter(node => node.props.children === 'check');
    expect(iconTexts.length).toBeGreaterThanOrEqual(1);

    const images = tree!.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.blurRadius).toBe(SELECTED_ARTWORK_IMAGE_BLUR_RADIUS);
  });
});
