/**
 * Spotify Tool — OAuth PKCE + Web API
 *
 * Full playback control, search, playlists, queue — using the free Spotify API.
 * PKCE flow: no client secret, mobile-friendly, tokens stored in SecureStore.
 *
 * Operations:
 *   auth        — start PKCE auth flow (opens Spotify login in browser)
 *   play        — play a track, album, playlist, or artist by name or URI
 *   pause       — pause playback
 *   resume      — resume playback
 *   next        — skip to next track
 *   previous    — go to previous track
 *   volume      — set volume (0-100)
 *   search      — search tracks, albums, artists, playlists
 *   queue       — add track to queue
 *   playlist    — list or create playlists
 *   current     — get currently playing track
 *   devices     — list available devices
 *   shuffle     — toggle shuffle
 *   repeat      — set repeat mode (off, context, track)
 *
 * Prerequisites:
 *   - SPOTIFY_CLIENT_ID in app config (free dev app from developer.spotify.com)
 *   - Redirect URI registered: alpenglow://spotify/callback
 *   - Scopes: user-read-playback-state, user-modify-playback-state,
 *             user-read-currently-playing, playlist-read-private,
 *             playlist-modify-public, playlist-modify-private,
 *             user-library-read, streaming
 */
import { Linking, Platform } from 'react-native';

// ── Config ──────────────────────────────────────────────────────────────────

const SPOTIFY_CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || '';
const REDIRECT_URI = 'alpenglow://spotify/callback';
const SCOPES = [
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'streaming',
].join(' ');

// ── Token storage (in-memory + SecureStore if available) ─────────────────────

let _accessToken: string | null = null;
let _refreshToken: string | null = null;
let _tokenExpiry: number = 0;
let _codeVerifier: string | null = null;

async function loadTokens() {
  try {
    const { default: SecureStore } = await import('expo-secure-store');
    _accessToken = await SecureStore.getItemAsync('spotify_access_token');
    _refreshToken = await SecureStore.getItemAsync('spotify_refresh_token');
    const expiry = await SecureStore.getItemAsync('spotify_token_expiry');
    _tokenExpiry = expiry ? parseInt(expiry) : 0;
  } catch {
    // SecureStore not available (non-Expo) — tokens only in memory this session
  }
}

async function saveTokens(access: string, refresh: string, expiresIn: number) {
  _accessToken = access;
  _refreshToken = refresh;
  _tokenExpiry = Date.now() + expiresIn * 1000;
  try {
    const { default: SecureStore } = await import('expo-secure-store');
    await SecureStore.setItemAsync('spotify_access_token', access);
    if (refresh) await SecureStore.setItemAsync('spotify_refresh_token', refresh);
    await SecureStore.setItemAsync('spotify_token_expiry', String(_tokenExpiry));
  } catch { /* in-memory only */ }
}

// ── PKCE helpers ─────────────────────────────────────────────────────────────

function generateRandomString(length: number): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  let result = '';
  for (let i = 0; i < length; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

async function sha256(plain: string): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const data = encoder.encode(plain);
  return crypto.subtle.digest('SHA-256', data);
}

function base64urlEncode(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let str = '';
  bytes.forEach(b => str += String.fromCharCode(b));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function buildPKCE(): Promise<{ verifier: string; challenge: string }> {
  const verifier = generateRandomString(64);
  const challenge = base64urlEncode(await sha256(verifier));
  return { verifier, challenge };
}

// ── Token management ─────────────────────────────────────────────────────────

async function getValidToken(): Promise<string> {
  await loadTokens();
  if (_accessToken && Date.now() < _tokenExpiry - 30000) {
    return _accessToken;
  }
  if (_refreshToken) {
    await refreshAccessToken();
    return _accessToken!;
  }
  throw new Error('Not authenticated — use the "auth" operation first');
}

async function refreshAccessToken() {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: _refreshToken!,
      client_id: SPOTIFY_CLIENT_ID,
    }).toString(),
  });
  if (!res.ok) throw new Error(`Token refresh failed: ${res.status}`);
  const data = await res.json();
  await saveTokens(data.access_token, data.refresh_token || _refreshToken!, data.expires_in);
}

// ── Exchange auth code for tokens (called after redirect) ────────────────────

export async function handleSpotifyCallback(url: string) {
  const params = new URLSearchParams(url.split('?')[1] || url.split('#')[1] || '');
  const code = params.get('code');
  const error = params.get('error');

  if (error) throw new Error(`Spotify auth error: ${error}`);
  if (!code || !_codeVerifier) throw new Error('Missing code or verifier');

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
      client_id: SPOTIFY_CLIENT_ID,
      code_verifier: _codeVerifier,
    }).toString(),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Token exchange failed: ${res.status} ${text}`);
  }
  const data = await res.json();
  await saveTokens(data.access_token, data.refresh_token, data.expires_in);
  _codeVerifier = null;
  return 'Spotify connected successfully';
}

// ── API helpers ───────────────────────────────────────────────────────────────

async function api(method: string, path: string, body?: any): Promise<any> {
  const token = await getValidToken();
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  });

  // 204 No Content — success with no body
  if (res.status === 204) return { success: true };

  // 202 Accepted — command sent to device
  if (res.status === 202) return { success: true };

  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: { message: res.statusText } }));
    throw new Error(err.error?.message || `API error ${res.status}`);
  }
  return res.json();
}

async function getActiveDeviceId(): Promise<string | undefined> {
  const data = await api('GET', '/me/player/devices');
  const active = data.devices?.find((d: any) => d.is_active);
  return active?.id || data.devices?.[0]?.id;
}

// ── Tool ──────────────────────────────────────────────────────────────────────

export const spotifyTool = {
  name: 'spotify',
  description: [
    'Control Spotify music playback and search.',
    'Play tracks/albums/playlists by name or URI, pause, skip, adjust volume, search content,',
    'manage queue and playlists, check what\'s currently playing.',
    'Operations: auth, play, pause, resume, next, previous, volume, search, queue, playlist, current, devices, shuffle, repeat.',
  ].join(' '),

  async execute(args: Record<string, unknown>): Promise<string> {
    const op = args.operation as string;

    try {
      switch (op) {

        case 'auth': {
          if (!SPOTIFY_CLIENT_ID) {
            return 'Spotify client ID not configured. Add SPOTIFY_CLIENT_ID to your environment.';
          }
          const { verifier, challenge } = await buildPKCE();
          _codeVerifier = verifier;
          const params = new URLSearchParams({
            response_type: 'code',
            client_id: SPOTIFY_CLIENT_ID,
            scope: SCOPES,
            redirect_uri: REDIRECT_URI,
            code_challenge_method: 'S256',
            code_challenge: challenge,
          });
          const authUrl = `https://accounts.spotify.com/authorize?${params}`;
          await Linking.openURL(authUrl);
          return 'Spotify login opened. After authorizing, the app will redirect back and connect automatically.';
        }

        case 'current': {
          const data = await api('GET', '/me/player/currently-playing');
          if (!data || !data.item) return 'Nothing currently playing';
          const track = data.item;
          const artists = track.artists?.map((a: any) => a.name).join(', ') || 'Unknown';
          return [
            `Now playing: ${track.name}`,
            `Artist: ${artists}`,
            `Album: ${track.album?.name}`,
            `Progress: ${Math.floor((data.progress_ms || 0) / 1000)}s / ${Math.floor(track.duration_ms / 1000)}s`,
            `Status: ${data.is_playing ? 'Playing' : 'Paused'}`,
            `URI: ${track.uri}`,
          ].join('\n');
        }

        case 'play': {
          const deviceId = await getActiveDeviceId();
          const query: any = {};
          if (deviceId) query.device_id = deviceId;

          const uri = args.uri as string;
          const trackName = args.track as string;
          const queryStr = args.query as string;

          let body: any = {};

          if (uri) {
            // Direct URI play
            if (uri.includes(':track:')) {
              body.uris = [uri];
            } else {
              body.context_uri = uri;
            }
          } else if (trackName || queryStr) {
            // Search first, then play
            const searchQuery = trackName || queryStr;
            const type = args.type as string || 'track';
            const searchRes = await api('GET', `/search?q=${encodeURIComponent(searchQuery)}&type=${type}&limit=1`);
            const items = searchRes.tracks?.items || searchRes.albums?.items || searchRes.playlists?.items || searchRes.artists?.items;
            if (!items || items.length === 0) return `No ${type} found for: ${searchQuery}`;
            const item = items[0];
            if (type === 'track') {
              body.uris = [item.uri];
            } else {
              body.context_uri = item.uri;
            }
            const name = item.name;
            const artist = item.artists?.[0]?.name;
            const played = artist ? `${name} by ${artist}` : name;
            await api('PUT', `/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`, body);
            return `Playing: ${played}`;
          }

          await api('PUT', `/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`, body);
          return 'Playback started';
        }

        case 'pause': {
          await api('PUT', '/me/player/pause');
          return 'Paused';
        }

        case 'resume': {
          const deviceId = await getActiveDeviceId();
          await api('PUT', `/me/player/play${deviceId ? `?device_id=${deviceId}` : ''}`);
          return 'Resumed';
        }

        case 'next': {
          await api('POST', '/me/player/next');
          await new Promise(r => setTimeout(r, 500));
          // Return new track info
          const data = await api('GET', '/me/player/currently-playing');
          if (data?.item) return `Skipped to: ${data.item.name} by ${data.item.artists?.[0]?.name}`;
          return 'Skipped to next track';
        }

        case 'previous': {
          await api('POST', '/me/player/previous');
          return 'Went to previous track';
        }

        case 'volume': {
          const vol = Math.max(0, Math.min(100, (args.volume as number) || 50));
          await api('PUT', `/me/player/volume?volume_percent=${vol}`);
          return `Volume set to ${vol}%`;
        }

        case 'shuffle': {
          const state = args.enabled !== false;
          await api('PUT', `/me/player/shuffle?state=${state}`);
          return `Shuffle ${state ? 'on' : 'off'}`;
        }

        case 'repeat': {
          const mode = (args.mode as string) || 'context';
          await api('PUT', `/me/player/repeat?state=${mode}`);
          return `Repeat: ${mode}`;
        }

        case 'search': {
          const query = args.query as string;
          if (!query) return 'search requires a query argument';
          const type = (args.type as string) || 'track,album,artist,playlist';
          const limit = Math.min((args.limit as number) || 5, 10);
          const data = await api('GET', `/search?q=${encodeURIComponent(query)}&type=${type}&limit=${limit}`);
          const lines: string[] = [`Search results for: "${query}"\n`];

          if (data.tracks?.items?.length) {
            lines.push('## Tracks');
            data.tracks.items.forEach((t: any) =>
              lines.push(`  • ${t.name} — ${t.artists?.[0]?.name} (${t.album?.name}) [${t.uri}]`)
            );
          }
          if (data.albums?.items?.length) {
            lines.push('\n## Albums');
            data.albums.items.forEach((a: any) =>
              lines.push(`  • ${a.name} — ${a.artists?.[0]?.name} [${a.uri}]`)
            );
          }
          if (data.playlists?.items?.length) {
            lines.push('\n## Playlists');
            data.playlists.items.forEach((p: any) =>
              lines.push(`  • ${p.name} (${p.tracks?.total} tracks) [${p.uri}]`)
            );
          }
          if (data.artists?.items?.length) {
            lines.push('\n## Artists');
            data.artists.items.forEach((a: any) =>
              lines.push(`  • ${a.name} (${a.followers?.total?.toLocaleString()} followers) [${a.uri}]`)
            );
          }
          return lines.join('\n');
        }

        case 'queue': {
          const uri = args.uri as string;
          const trackName = args.track as string;

          let trackUri = uri;
          if (!trackUri && trackName) {
            const data = await api('GET', `/search?q=${encodeURIComponent(trackName)}&type=track&limit=1`);
            const track = data.tracks?.items?.[0];
            if (!track) return `Track not found: ${trackName}`;
            trackUri = track.uri;
          }
          if (!trackUri) return 'queue requires a uri or track argument';

          await api('POST', `/me/player/queue?uri=${encodeURIComponent(trackUri)}`);
          return `Added to queue: ${trackUri}`;
        }

        case 'playlist': {
          const subOp = (args.action as string) || 'list';

          if (subOp === 'list') {
            const data = await api('GET', '/me/playlists?limit=20');
            return data.items?.map((p: any) =>
              `  • ${p.name} (${p.tracks?.total} tracks) [${p.uri}]`
            ).join('\n') || 'No playlists found';
          }

          if (subOp === 'create') {
            const me = await api('GET', '/me');
            const playlist = await api('POST', `/users/${me.id}/playlists`, {
              name: args.name as string || 'New Playlist',
              description: args.description as string || '',
              public: args.public !== false,
            });
            return `Created playlist: ${playlist.name} [${playlist.uri}]`;
          }

          return `Unknown playlist action: ${subOp}. Use list or create.`;
        }

        case 'devices': {
          const data = await api('GET', '/me/player/devices');
          if (!data.devices?.length) return 'No active devices found. Open Spotify on a device first.';
          return data.devices.map((d: any) =>
            `  • ${d.name} (${d.type}) ${d.is_active ? '← active' : ''} volume: ${d.volume_percent}%`
          ).join('\n');
        }

        default:
          return [
            `Unknown Spotify operation: "${op}"`,
            'Available: auth, play, pause, resume, next, previous, volume, search, queue, playlist, current, devices, shuffle, repeat',
          ].join('\n');
      }
    } catch (err: any) {
      if (err.message?.includes('Not authenticated')) {
        return `Spotify not connected. Ask me to connect Spotify first (operation: "auth").`;
      }
      return `Spotify error (${op}): ${err.message}`;
    }
  },
};
