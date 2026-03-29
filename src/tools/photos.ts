/**
 * Photos Tool — PhotoKit (iOS) / MediaStore (Android)
 * Browse, search, organize photos and albums
 */
import { NativeModules } from 'react-native';

const { PhotosBridge } = NativeModules;

export const photosTool = {
  name: 'photos',
  description: 'Browse and organize photos — recent photos, albums, search by date/location',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'recent': {
          const count = (args.count as number) || 10;
          const photos = await PhotosBridge.getRecent(count);
          return `${photos.length} recent photos:\n${photos.map((p: any) => `  ${p.date} — ${p.width}x${p.height} — ${p.location || 'no location'}`).join('\n')}`;
        }
        case 'albums': {
          const albums = await PhotosBridge.getAlbums();
          return albums.map((a: any) => `${a.name} (${a.count} photos)`).join('\n');
        }
        case 'search': {
          const query = args.query as string;
          const results = await PhotosBridge.search(query);
          return `Found ${results.length} photos matching "${query}"`;
        }
        default:
          return `Unknown photos operation: ${operation}`;
      }
    } catch (err: any) {
      return `Photos error: ${err.message}`;
    }
  }
};
