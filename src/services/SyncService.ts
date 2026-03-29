/**
 * Sync Service — Bidirectional memory sync between phone and desktop
 *
 * When desktop is online: syncs directly via local network (fast, no cloud)
 * When desktop is offline: queues ops, syncs when reconnected
 * When on different networks: uses cloud relay as intermediary
 *
 * The result: one Silas, one brain, both devices.
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { deviceManager } from './DeviceManager';
import { memoryService } from './MemoryService';
import { desktopBridge } from './DesktopBridge';

const CLOUD_URL = 'https://alpenglow.onrender.com';
const SYNC_INTERVAL = 30000; // 30 seconds

interface SyncState {
  lastSyncAt: number;
  sequenceNumber: number;
  stateHash: string;
  pendingOps: DeltaOp[];
  lastDesktopSeq: number; // track where we are in the desktop's event log
}

export interface DeltaOp {
  type: 'insert' | 'update' | 'delete' | 'score_change';
  path: string;
  payload?: {
    text: string;
    role: string;
    agentName: string;
    sessionId: string;
  };
  score?: number;
  layer?: string;
  timestamp: number;
}

class SyncService {
  private state: SyncState = {
    lastSyncAt: 0,
    sequenceNumber: 0,
    stateHash: '',
    pendingOps: [],
    lastDesktopSeq: 0,
  };
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private isRunning = false;

  /**
   * Start the sync service
   */
  async start(): Promise<void> {
    // Load persisted sync state
    try {
      const stored = await AsyncStorage.getItem('alpenglow_sync_state');
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state = { ...this.state, ...parsed };
      }
    } catch {}

    this.isRunning = true;
    console.log('[sync] Service started');

    // Periodic sync
    this.syncTimer = setInterval(() => this.sync(), SYNC_INTERVAL);

    // Initial sync after short delay (let bridge init first)
    setTimeout(() => this.sync(), 3000);
  }

  /**
   * Stop sync service
   */
  stop(): void {
    this.isRunning = false;
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
  }

  /**
   * Record a memory operation for sync.
   * Called by useAgents after every storeTurn.
   */
  recordOperation(op: Omit<DeltaOp, 'timestamp'>): void {
    this.state.pendingOps.push({
      ...op,
      timestamp: Date.now(),
    });
    this.persistState();
  }

  /**
   * Perform sync — routes to desktop if connected, cloud relay if not
   */
  async sync(): Promise<{ sent: number; received: number } | null> {
    if (!this.isRunning) return null;

    const device = deviceManager.getState();
    if (!device?.licenseKey) return null;

    // Desktop is on the same network? Sync directly. Way faster.
    if (desktopBridge.isConnected && desktopBridge.desktopUrl) {
      return this.syncWithDesktop(desktopBridge.desktopUrl, device.licenseKey);
    }

    // Fallback: cloud relay (for when on different networks)
    return this.syncWithCloud(device.licenseKey);
  }

  /**
   * Direct sync with desktop server (local network)
   */
  private async syncWithDesktop(desktopUrl: string, licenseKey: string): Promise<{ sent: number; received: number } | null> {
    try {
      const deviceId = await deviceManager.getDeviceFingerprint();
      let sent = 0;
      let received = 0;

      // 1. PUSH: Send our pending ops to desktop
      if (this.state.pendingOps.length > 0) {
        const response = await fetch(`${desktopUrl}/api/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${licenseKey}`,
          },
          body: JSON.stringify({
            deviceId,
            sequenceNumber: ++this.state.sequenceNumber,
            priorStateHash: this.state.stateHash,
            operations: this.state.pendingOps,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          sent = this.state.pendingOps.length;
          this.state.pendingOps = [];
          const result = await response.json();
          this.state.stateHash = result.stateHash || this.state.stateHash;
        }
      }

      // 2. PULL: Get desktop's events that we don't have yet
      const pullResponse = await fetch(`${desktopUrl}/api/sync/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${licenseKey}`,
        },
        body: JSON.stringify({
          deviceId,
          lastSequence: this.state.lastDesktopSeq,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (pullResponse.ok) {
        const pullData = await pullResponse.json();
        if (pullData.operations?.length > 0) {
          // Apply desktop events to local memory
          let maxSeq = this.state.lastDesktopSeq;
          for (const op of pullData.operations) {
            if (op.type === 'insert' && op.payload) {
              await memoryService.storeTurn(
                op.payload.text || '',
                op.payload.role || 'user',
                op.payload.agentName || 'unknown',
                op.payload.sessionId || 'sync',
              );
              if (op.seq !== undefined && op.seq > maxSeq) {
                maxSeq = op.seq;
              }
            }
          }
          this.state.lastDesktopSeq = maxSeq + 1;
          received = pullData.operations.length;
        }
      }

      this.state.lastSyncAt = Date.now();
      await this.persistState();

      if (sent > 0 || received > 0) {
        console.log(`[sync] Desktop: sent ${sent}, received ${received} ops`);
      }

      return { sent, received };
    } catch (err: any) {
      console.warn(`[sync] Desktop sync failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Sync via cloud relay (for when devices are on different networks)
   */
  private async syncWithCloud(licenseKey: string): Promise<{ sent: number; received: number } | null> {
    try {
      const deviceId = await deviceManager.getDeviceFingerprint();
      let sent = 0;
      let received = 0;

      // 1. Push pending ops
      if (this.state.pendingOps.length > 0) {
        const response = await fetch(`${CLOUD_URL}/sync/push`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${licenseKey}`,
          },
          body: JSON.stringify({
            deviceId,
            sequenceNumber: ++this.state.sequenceNumber,
            priorStateHash: this.state.stateHash,
            operations: this.state.pendingOps,
          }),
          signal: AbortSignal.timeout(10000),
        });

        if (response.ok) {
          sent = this.state.pendingOps.length;
          this.state.pendingOps = [];
          const result = await response.json();
          this.state.stateHash = result.stateHash || this.state.stateHash;
        }
      }

      // 2. Pull ops from other devices
      const pullResponse = await fetch(`${CLOUD_URL}/sync/pull`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${licenseKey}`,
        },
        body: JSON.stringify({
          deviceId,
          lastSequence: this.state.sequenceNumber,
        }),
        signal: AbortSignal.timeout(10000),
      });

      if (pullResponse.ok) {
        const pullData = await pullResponse.json();
        if (pullData.operations?.length > 0) {
          for (const op of pullData.operations) {
            if (op.type === 'insert' && op.payload) {
              await memoryService.storeTurn(
                op.payload.text || '',
                op.payload.role || 'user',
                op.payload.agentName || 'unknown',
                op.payload.sessionId || 'sync',
              );
            }
          }
          received = pullData.operations.length;
        }
      }

      this.state.lastSyncAt = Date.now();
      await this.persistState();

      if (sent > 0 || received > 0) {
        console.log(`[sync] Cloud: sent ${sent}, received ${received} ops`);
      }

      return { sent, received };
    } catch (err: any) {
      console.warn(`[sync] Cloud sync failed: ${err.message}`);
      return null;
    }
  }

  /**
   * Get sync status for UI
   */
  getStatus(): { pending: number; lastSync: number; isRunning: boolean; mode: string } {
    return {
      pending: this.state.pendingOps.length,
      lastSync: this.state.lastSyncAt,
      isRunning: this.isRunning,
      mode: desktopBridge.isConnected ? 'desktop' : 'cloud',
    };
  }

  private async persistState(): Promise<void> {
    try {
      await AsyncStorage.setItem('alpenglow_sync_state', JSON.stringify(this.state));
    } catch {}
  }
}

export const syncService = new SyncService();
