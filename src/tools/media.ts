/**
 * Media Tool — MediaPlayer (iOS) / MediaSession (Android)
 * Control music playback, manage playlists, now playing info
 */
import { NativeModules } from 'react-native';

const { MediaBridge } = NativeModules;

export const mediaTool = {
  name: 'media',
  description: 'Control music and media playback — play, pause, skip, queue, playlists',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'play':
          await MediaBridge.play(args.query as string);
          return `Playing: ${args.query}`;
        case 'pause':
          await MediaBridge.pause();
          return 'Paused';
        case 'skip':
          await MediaBridge.skip();
          return 'Skipped to next track';
        case 'previous':
          await MediaBridge.previous();
          return 'Playing previous track';
        case 'nowplaying': {
          const info = await MediaBridge.getNowPlaying();
          return info ? `Now playing: ${info.title} by ${info.artist} (${info.album})` : 'Nothing playing';
        }
        case 'volume': {
          const level = args.level as number;
          await MediaBridge.setVolume(level);
          return `Volume set to ${Math.round(level * 100)}%`;
        }
        default:
          return `Unknown media operation: ${operation}`;
      }
    } catch (err: any) {
      return `Media error: ${err.message}`;
    }
  }
};
