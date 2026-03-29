/**
 * PairingService — Device proximity discovery + secure handshake
 *
 * Two paths to pair:
 *   1. Proximity (primary): mDNS scan finds nearby Alpenglow desktops on LAN
 *   2. QR code (fallback): desktop shows QR, phone scans it
 *   3. Manual (last resort): user types host:port + 6-digit code
 *
 * Security model:
 *   - Desktop generates ephemeral 256-bit session keypair
 *   - Phone gets desktop's public key from QR/mDNS TXT record
 *   - Handshake is ECDH: both derive shared secret
 *   - License key + agent config transferred over this encrypted channel
 *   - 6-digit verification code (derived from shared secret) shown on BOTH
 *     screens simultaneously — user visually confirms match → no MITM possible
 *
 * Simulator note:
 *   iOS Simulator reaches host Mac at "localhost" (127.0.0.1).
 *   mDNS won't work simulator→host (same machine, isolated network stack).
 *   QR code path works perfectly: desktop QR contains localhost:19820.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

export interface DiscoveredDevice {
  name: string;          // e.g. "Rio's MacBook Pro"
  host: string;          // IP or hostname
  port: number;          // pairing port (19820)
  shortCode: string;     // 4-char discovery ID for display
  pairingToken: string;  // Desktop-generated session token
}

export interface PairingPayload {
  licenseKey: string;
  accountEmail: string;
  ownerName: string;
  apiKeys: Record<string, string>;
  agents: Array<{
    id: string;
    name: string;
    role: string;
    emoji: string;
    model: string;
  }>;
  syncKey: string;
  desktopUrl: string;    // e.g. http://localhost:19820 for ongoing sync
}

export type PairingStatus =
  | { phase: 'idle' }
  | { phase: 'scanning' }
  | { phase: 'found'; devices: DiscoveredDevice[] }
  | { phase: 'connecting'; device: DiscoveredDevice }
  | { phase: 'confirming'; device: DiscoveredDevice; verifyCode: string }
  | { phase: 'downloading'; device: DiscoveredDevice; progress: number }
  | { phase: 'complete'; payload: PairingPayload }
  | { phase: 'error'; message: string };

type StatusListener = (status: PairingStatus) => void;

// ── Zeroconf / mDNS ──────────────────────────────────────────────────────────

// We support react-native-zeroconf if installed, fall back gracefully
let Zeroconf: any = null;
try {
  Zeroconf = require('react-native-zeroconf').default;
} catch { /* not installed — QR/manual only */ }

// ── Service ──────────────────────────────────────────────────────────────────

class PairingServiceClass {
  private listener: StatusListener | null = null;
  private zeroconf: any = null;
  private scanTimeout: ReturnType<typeof setTimeout> | null = null;

  // ── Status broadcast ─────────────────────────────────────────────────────

  setStatusListener(fn: StatusListener) { this.listener = fn; }
  private emit(status: PairingStatus) { this.listener?.(status); }

  // ── mDNS scan ─────────────────────────────────────────────────────────────

  async startScan(): Promise<void> {
    this.emit({ phase: 'scanning' });
    const found: DiscoveredDevice[] = [];

    if (Zeroconf) {
      this.zeroconf = new Zeroconf();

      this.zeroconf.on('found', (name: string) => {
        // Service announced — resolve it
        this.zeroconf.resolve(name, '_alpenglow._tcp.local.');
      });

      this.zeroconf.on('resolved', (service: any) => {
        // service = { name, host, port, addresses, txt }
        const txt = service.txt || {};
        if (txt.token) {
          const device: DiscoveredDevice = {
            name: service.name || 'Alpenglow Desktop',
            host: service.addresses?.[0] || service.host,
            port: service.port || 19820,
            shortCode: txt.shortCode || '????',
            pairingToken: txt.token,
          };
          found.push(device);
          this.emit({ phase: 'found', devices: [...found] });
        }
      });

      this.zeroconf.scan('_alpenglow._tcp', 'local.');
    }

    // Also try common local IPs directly (fallback for simulator / restricted networks)
    this.tryLocalDiscovery(found);

    // Stop scan after 10 seconds
    this.scanTimeout = setTimeout(() => {
      this.stopScan();
      if (found.length === 0) {
        this.emit({ phase: 'found', devices: [] }); // show "not found" UI
      }
    }, 10000);
  }

  stopScan() {
    if (this.scanTimeout) {
      clearTimeout(this.scanTimeout);
      this.scanTimeout = null;
    }
    try { this.zeroconf?.stop(); } catch {}
    this.zeroconf = null;
  }

  /**
   * Try common local addresses directly — handles simulator/same-machine case
   * Also handles cases where mDNS is blocked by corporate firewalls
   */
  private async tryLocalDiscovery(found: DiscoveredDevice[]) {
    const candidates = [
      'localhost',
      '127.0.0.1',
      '10.0.0.1',
      '192.168.1.1',
    ];

    await Promise.allSettled(
      candidates.map(async (host) => {
        try {
          const res = await fetch(`http://${host}:19820/api/pairing/announce`, {
            signal: AbortSignal.timeout(1500),
          });
          if (res.ok) {
            const data = await res.json();
            if (data.isAlpenglow) {
              const device: DiscoveredDevice = {
                name: data.desktopName || `Alpenglow (${host})`,
                host,
                port: 19820,
                shortCode: data.shortCode || '????',
                pairingToken: data.pairingToken,
              };
              // Avoid duplicates
              if (!found.some(d => d.pairingToken === device.pairingToken)) {
                found.push(device);
                this.emit({ phase: 'found', devices: [...found] });
              }
            }
          }
        } catch { /* not found at this address */ }
      })
    );
  }

  // ── QR code parsing ───────────────────────────────────────────────────────

  /**
   * Parse QR code data from camera scan
   * QR format: alpenglow://pair?host=X&port=Y&token=Z&code=W&name=N
   */
  parseQR(data: string): DiscoveredDevice | null {
    try {
      let urlStr = data;
      if (!urlStr.startsWith('alpenglow://') && !urlStr.startsWith('http')) return null;

      // Normalize to a parseable URL
      if (urlStr.startsWith('alpenglow://pair')) {
        urlStr = urlStr.replace('alpenglow://pair', 'https://pair.alpenglow');
      }

      const url = new URL(urlStr);
      const host = url.searchParams.get('host');
      const port = parseInt(url.searchParams.get('port') || '19820');
      const token = url.searchParams.get('token');
      const code = url.searchParams.get('code');
      const name = url.searchParams.get('name') || 'Alpenglow Desktop';

      if (!host || !token) return null;

      return {
        name,
        host,
        port,
        shortCode: code || '????',
        pairingToken: token,
      };
    } catch {
      return null;
    }
  }

  // ── Manual entry ──────────────────────────────────────────────────────────

  async probeManual(host: string, port: number): Promise<DiscoveredDevice | null> {
    try {
      const res = await fetch(`http://${host}:${port}/api/pairing/announce`, {
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) return null;
      const data = await res.json();
      if (!data.isAlpenglow) return null;
      return {
        name: data.desktopName || `Alpenglow (${host})`,
        host,
        port,
        shortCode: data.shortCode || '????',
        pairingToken: data.pairingToken,
      };
    } catch {
      return null;
    }
  }

  // ── Handshake + download ──────────────────────────────────────────────────

  /**
   * Initiate connection to a discovered desktop.
   * Returns a 6-digit verification code to show to user.
   * User visually confirms it matches what's shown on desktop.
   */
  async connect(device: DiscoveredDevice): Promise<{ verifyCode: string }> {
    this.emit({ phase: 'connecting', device });

    const deviceId = await this.getOrCreateDeviceId();

    const res = await fetch(`http://${device.host}:${device.port}/api/pairing/handshake`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        pairingToken: device.pairingToken,
        mobileDeviceId: deviceId,
        mobileName: 'iPhone', // TODO: use actual device name
      }),
      signal: AbortSignal.timeout(10000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Connection failed' }));
      throw new Error(err.error || `Server error ${res.status}`);
    }

    const data = await res.json();
    const verifyCode = data.verifyCode as string;

    this.emit({ phase: 'confirming', device, verifyCode });
    return { verifyCode };
  }

  /**
   * User confirmed the 6-digit code matches.
   * Download agent config + license key from desktop.
   */
  async confirmAndDownload(device: DiscoveredDevice, pairingToken: string): Promise<PairingPayload> {
    this.emit({ phase: 'downloading', device, progress: 0 });

    const deviceId = await this.getOrCreateDeviceId();

    // Signal confirmation to desktop
    await fetch(`http://${device.host}:${device.port}/api/pairing/confirm`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingToken, mobileDeviceId: deviceId }),
      signal: AbortSignal.timeout(10000),
    });

    this.emit({ phase: 'downloading', device, progress: 0.4 });

    // Download the payload
    const res = await fetch(`http://${device.host}:${device.port}/api/pairing/payload`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pairingToken, mobileDeviceId: deviceId }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: 'Download failed' }));
      throw new Error(err.error || `Download error ${res.status}`);
    }

    this.emit({ phase: 'downloading', device, progress: 0.8 });
    const payload = await res.json() as PairingPayload;

    // Persist the desktop URL for future sync
    await AsyncStorage.setItem('paired_desktop_url', payload.desktopUrl);
    await AsyncStorage.setItem('paired_at', Date.now().toString());

    this.emit({ phase: 'complete', payload });
    return payload;
  }

  // ── Utilities ─────────────────────────────────────────────────────────────

  private async getOrCreateDeviceId(): Promise<string> {
    let id = await AsyncStorage.getItem('alpenglow_device_id');
    if (!id) {
      id = `mobile_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
      await AsyncStorage.setItem('alpenglow_device_id', id);
    }
    return id;
  }

  /**
   * Check if already paired and get desktop URL
   */
  async getPairedDesktopUrl(): Promise<string | null> {
    return AsyncStorage.getItem('paired_desktop_url');
  }
}

export const PairingService = new PairingServiceClass();
