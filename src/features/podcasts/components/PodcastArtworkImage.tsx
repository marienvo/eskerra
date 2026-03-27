import {Image, StyleProp, View, ImageStyle, ViewStyle} from 'react-native';
import MaterialIcons from 'react-native-vector-icons/MaterialIcons';

import {usePodcastArtworkDisplayUri} from '../hooks/usePodcastArtworkDisplayUri';

type PodcastArtworkImageProps = {
  artworkUri: string | null;
  imageStyle: StyleProp<ImageStyle>;
  placeholderStyle: StyleProp<ViewStyle>;
};

export function PodcastArtworkImage({
  artworkUri,
  imageStyle,
  placeholderStyle,
}: PodcastArtworkImageProps) {
  const displayUri = usePodcastArtworkDisplayUri(artworkUri);

  if (!displayUri) {
    return (
      <View style={placeholderStyle}>
        <MaterialIcons color="#8f8f8f" name="music-note" size={20} />
      </View>
    );
  }

  return (
    <Image source={{uri: displayUri}} style={imageStyle} />
  );
}
