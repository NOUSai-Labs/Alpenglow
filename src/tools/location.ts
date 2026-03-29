/**
 * Location Tool — MapKit/CoreLocation (iOS) / LocationManager (Android)
 * Get current location, directions, nearby places
 */
import { NativeModules } from 'react-native';

const { LocationBridge } = NativeModules;

export const locationTool = {
  name: 'location',
  description: 'Location services — current location, directions, nearby places, distance',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'current': {
          const loc = await LocationBridge.getCurrent();
          return `Current location: ${loc.latitude}, ${loc.longitude} (${loc.address || 'address lookup pending'})`;
        }
        case 'directions': {
          const from = args.from as string || 'current';
          const to = args.to as string;
          const result = await LocationBridge.getDirections(from, to);
          return `Directions to ${to}:\n  Distance: ${result.distance}\n  Duration: ${result.duration}\n  Route: ${result.summary}`;
        }
        case 'nearby': {
          const query = args.query as string;
          const results = await LocationBridge.searchNearby(query);
          return results.map((r: any) => `${r.name} — ${r.distance} — ${r.rating || 'no rating'}`).join('\n');
        }
        default:
          return `Unknown location operation: ${operation}`;
      }
    } catch (err: any) {
      return `Location error: ${err.message}`;
    }
  }
};
