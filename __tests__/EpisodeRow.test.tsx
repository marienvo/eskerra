/**
 * @format
 */

import {act, create, ReactTestRenderer} from 'react-test-renderer';
import {Image} from 'react-native';

import {EpisodeRow} from '../src/features/podcasts/components/EpisodeRow';
import {PodcastEpisode} from '../src/types';

jest.mock('react-native-gesture-handler/Swipeable', () => {
  const React = require('react');
  const {View} = require('react-native');

  return function SwipeableMock({children}: {children: React.ReactNode}) {
    return <View>{children}</View>;
  };
});

jest.mock('react-native-vector-icons/MaterialIcons', () => {
  const React = require('react');
  const {Text} = require('react-native');

  return function MaterialIconsMock({name}: {name: string}) {
    return <Text>{name}</Text>;
  };
});

describe('EpisodeRow', () => {
  const episode: PodcastEpisode = {
    date: '2026-03-22',
    id: 'episode-1',
    isListened: false,
    mp3Url: 'https://example.com/episode-1.mp3',
    sectionTitle: 'News',
    seriesName: 'Daily Show',
    sourceFile: '2026 Daily Show - podcasts.md',
    title: 'Morning Update',
  };

  function renderRow(artworkUri: string | null): ReactTestRenderer {
    return create(
      <EpisodeRow
        activeEpisodeId={null}
        artworkUri={artworkUri}
        dividerColor="#cccccc"
        episode={episode}
        mutedTextColor="#666666"
        onMarkAsPlayed={jest.fn().mockResolvedValue(undefined)}
        onPlayEpisode={jest.fn().mockResolvedValue(undefined)}
        playbackLoading={false}
        playbackState="paused"
      />,
    );
  }

  test('renders episode artwork when artworkUri is provided', async () => {
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderRow('https://example.com/artwork.png');
    });

    const images = tree!.root.findAllByType(Image);
    expect(images).toHaveLength(1);
    expect(images[0].props.source).toEqual({uri: 'https://example.com/artwork.png'});
  });

  test('renders no image when artworkUri is not provided', async () => {
    let tree: ReactTestRenderer;

    await act(async () => {
      tree = renderRow(null);
    });

    const images = tree!.root.findAllByType(Image);
    expect(images).toHaveLength(0);
  });
});
