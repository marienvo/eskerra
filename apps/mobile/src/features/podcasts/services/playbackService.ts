import {Event} from 'react-native-track-player';
import TrackPlayer from 'react-native-track-player';

export async function playbackService() {
  TrackPlayer.addEventListener(Event.RemotePlay, () => {
    TrackPlayer.play().catch(() => undefined);
  });

  TrackPlayer.addEventListener(Event.RemotePause, () => {
    TrackPlayer.pause().catch(() => undefined);
  });

  TrackPlayer.addEventListener(Event.RemotePlayPause, async () => {
    const shouldPlay = !(await TrackPlayer.getPlayWhenReady());

    if (shouldPlay) {
      await TrackPlayer.play();
      return;
    }

    await TrackPlayer.pause();
  });

  TrackPlayer.addEventListener(Event.RemoteSeek, event => {
    TrackPlayer.seekTo(event.position).catch(() => undefined);
  });

  TrackPlayer.addEventListener(Event.RemoteStop, () => {
    TrackPlayer.stop().catch(() => undefined);
  });

  // When the queue ends naturally, reset the player so Android stops the
  // foreground service and removes the media notification. Without this,
  // the MediaSession and notification persist even though nothing is playing.
  TrackPlayer.addEventListener(Event.PlaybackQueueEnded, () => {
    TrackPlayer.reset().catch(() => undefined);
  });
}
