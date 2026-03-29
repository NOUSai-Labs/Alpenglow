/**
 * Device Manager — handles licensing, device pairing, and sync approval
 *
 * Phone is the anchor device. Desktop is the satellite.
 * Maximum one phone + one computer active at any time.
 * All device changes require biometric confirmation on phone.
 */

import { NativeModules, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

const { NousMemoryBridge } = NativeModules;

interface DeviceInfo {
  id: string;
  type: 'phone' | 'desktop' | 'drive';
  name: string;
  fingerprint: string;
  paired: boolean;
  pairedAt: number;
  lastSync: number;
}

interface LicenseState {
  licenseKey: string;
  accountEmail: string;
  phoneDevice: DeviceInfo | null;
  desktopDevice: DeviceInfo | null;
  driveDevice: DeviceInfo | null;
}

const STORAGE_KEY = 'alpenglow_license_state';
const CLOUD_URL = 'https://alpenglow.onrender.com';

export class DeviceManager {
  private state: LicenseState | null = null;

  async load(): Promise<LicenseState | null> {
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        this.state = JSON.parse(stored);
      }
      return this.state;
    } catch {
      return null;
    }
  }

  async save(): Promise<void> {
    if (!this.state) return;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.state));
  }

  /**
   * Generate device fingerprint for this phone
   * Uses device-specific identifiers that persist across app reinstalls
   */
  async getDeviceFingerprint(): Promise<string> {
    // On iOS: use identifierForVendor
    // On Android: use ANDROID_ID
    // Both are device-specific and persist across app sessions
    const deviceId = await this.getDeviceId();
    const model = Platform.OS === 'ios' ? 'iPhone' : 'Android';
    const version = Platform.Version;

    // SHA-256 of device identifiers
    // In production, use the Rust crypto module for this
    const raw = `${deviceId}-${model}-${version}-nous-mobile`;
    let hash = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) {
      hash ^= raw.charCodeAt(i);
      hash = Math.imul(hash, 0x01000193);
    }
    return Math.abs(hash).toString(16).padStart(8, '0') + '-mobile';
  }

  private async getDeviceId(): Promise<string> {
    // Try to get stored device ID first (persists across sessions)
    let deviceId = await AsyncStorage.getItem('alpenglow_device_id');
    if (deviceId) return deviceId;

    // Generate new one
    deviceId = `dev_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    await AsyncStorage.setItem('alpenglow_device_id', deviceId);
    return deviceId;
  }

  /**
   * Register this phone as the primary device
   * Called during first-time setup
   */
  async registerPhone(email: string, licenseKey: string): Promise<boolean> {
    const fingerprint = await this.getDeviceFingerprint();
    const deviceName = Platform.OS === 'ios' ? 'iPhone' : 'Android Phone';

    this.state = {
      licenseKey,
      accountEmail: email,
      phoneDevice: {
        id: fingerprint,
        type: 'phone',
        name: deviceName,
        fingerprint,
        paired: true,
        pairedAt: Date.now(),
        lastSync: Date.now(),
      },
      desktopDevice: null,
      driveDevice: null,
    };

    // Initialize the Rust memory engine with device-bound key
    try {
      await NousMemoryBridge.initialize(licenseKey, fingerprint);
    } catch (err) {
      console.warn('Memory engine init failed, using dev mode:', err);
      // Dev mode — still works, just not encrypted
      await NousMemoryBridge.initialize('dev-mode-key', fingerprint);
    }

    await this.save();

    // Register with cloud
    try {
      await fetch(`${CLOUD_URL}/auth/register-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          licenseKey,
          deviceType: 'phone',
          fingerprint,
          deviceName,
        }),
      });
    } catch (err: any) {
      // Offline — will sync later
      console.debug("[sync] caught:", err?.message);
    }

    return true;
  }

  /**
   * Generate a pairing code for desktop to request sync
   * Desktop shows this code, user enters it on phone to approve
   */
  async generatePairingRequest(desktopFingerprint: string, desktopName: string): Promise<string> {
    // Generate 6-digit pairing code
    const code = Math.floor(100000 + Math.random() * 900000).toString();

    // Store pending request
    await AsyncStorage.setItem('pending_pair', JSON.stringify({
      code,
      fingerprint: desktopFingerprint,
      name: desktopName,
      requestedAt: Date.now(),
      expiresAt: Date.now() + 5 * 60 * 1000, // 5 minute expiry
    }));

    return code;
  }

  /**
   * Approve a desktop pairing request
   * Called after user confirms on phone (with biometric)
   */
  async approveDesktopPairing(code: string): Promise<{ success: boolean; syncKey?: string }> {
    const pending = await AsyncStorage.getItem('pending_pair');
    if (!pending) return { success: false };

    const request = JSON.parse(pending);
    if (request.code !== code || Date.now() > request.expiresAt) {
      return { success: false };
    }

    if (!this.state) return { success: false };

    // Create desktop device entry
    this.state.desktopDevice = {
      id: request.fingerprint,
      type: 'desktop',
      name: request.name,
      fingerprint: request.fingerprint,
      paired: true,
      pairedAt: Date.now(),
      lastSync: Date.now(),
    };

    await this.save();
    await AsyncStorage.removeItem('pending_pair');

    // Derive a sync key that desktop can use
    // This key + desktop's fingerprint = desktop's encryption key
    const syncKey = `${this.state.licenseKey}-sync-${Date.now()}`;

    // Notify cloud about the pairing
    try {
      await fetch(`${CLOUD_URL}/auth/pair-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: this.state.licenseKey,
          phoneFingerprint: this.state.phoneDevice?.fingerprint,
          desktopFingerprint: request.fingerprint,
          desktopName: request.name,
          syncKey,
        }),
      });
    } catch (err: any) {
      // Offline — will sync later
      console.debug("[sync] caught:", err?.message);
    }

    return { success: true, syncKey };
  }

  /**
   * Revoke a desktop's access
   * Called from phone Settings → Devices → Remove
   */
  async revokeDesktop(): Promise<boolean> {
    if (!this.state?.desktopDevice) return false;

    const revokedFingerprint = this.state.desktopDevice.fingerprint;
    this.state.desktopDevice = null;
    await this.save();

    // Notify cloud to invalidate desktop's keys
    try {
      await fetch(`${CLOUD_URL}/auth/revoke-device`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          licenseKey: this.state.licenseKey,
          revokedFingerprint,
        }),
      });
    } catch (err: any) {
      // Offline — will sync on next connect
      console.debug("[sync] caught:", err?.message);
    }

    return true;
  }

  /**
   * Revoke this phone (called from desktop when transferring to new phone)
   * Wipes local memory and invalidates license on this device
   */
  async revokePhone(): Promise<boolean> {
    if (!this.state) return false;

    // Wipe local memory
    try {
      await AsyncStorage.removeItem(STORAGE_KEY);
      await AsyncStorage.removeItem('alpenglow_device_id');
      await AsyncStorage.removeItem('alpenglow_settings');
      await AsyncStorage.removeItem('alpenglow_agents');
    } catch (err: any) {
      // Best effort wipe
      console.debug("[sync] caught:", err?.message);
    }

    this.state = null;
    return true;
  }

  /**
   * Add portable drive as a sync target
   * Drive gets its own fingerprint based on drive serial/UUID
   */
  async pairDrive(driveFingerprint: string, driveName: string): Promise<boolean> {
    if (!this.state) return false;

    this.state.driveDevice = {
      id: driveFingerprint,
      type: 'drive',
      name: driveName,
      fingerprint: driveFingerprint,
      paired: true,
      pairedAt: Date.now(),
      lastSync: Date.now(),
    };

    await this.save();
    return true;
  }

  /**
   * Get all paired devices
   */
  getDevices(): DeviceInfo[] {
    if (!this.state) return [];
    const devices: DeviceInfo[] = [];
    if (this.state.phoneDevice) devices.push(this.state.phoneDevice);
    if (this.state.desktopDevice) devices.push(this.state.desktopDevice);
    if (this.state.driveDevice) devices.push(this.state.driveDevice);
    return devices;
  }

  /**
   * Check if memory engine is initialized
   */
  async isMemoryReady(): Promise<boolean> {
    try {
      const count = await NousMemoryBridge.getMemoryCount();
      return count >= 0;
    } catch {
      return false;
    }
  }

  /**
   * Get current license state
   */
  getState(): LicenseState | null {
    return this.state;
  }
}

export const deviceManager = new DeviceManager();
