/**
 * Memory Service — wraps the Rust FFI memory engine for use throughout the app
 *
 * Every conversation turn gets stored in the holographic helix.
 * Every query triggers cross-layer resonance retrieval.
 * Memory health is monitored continuously.
 */

import { NativeModules } from 'react-native';
import { deviceManager } from './DeviceManager';

const { NousMemoryBridge } = NativeModules;

interface MemoryHealth {
  diversity: number;
  isCollapsing: boolean;
  memoryCount: number;
  capacity: number;
}

interface RecallResult {
  id: string;
  text: string;
  resonance: number;
  layer: string;
  score: number;
}

class MemoryService {
  private initialized = false;

  /**
   * Initialize the memory engine
   * Must be called after device registration
   */
  async init(): Promise<boolean> {
    try {
      const state = deviceManager.getState();
      const fingerprint = await deviceManager.getDeviceFingerprint();
      const licenseKey = state?.licenseKey || 'dev-mode-key';

      await NousMemoryBridge.initialize(licenseKey, fingerprint);
      this.initialized = true;

      // Try to load persisted memory from disk
      await this.loadFromDisk();

      console.debug('[memory] Engine initialized');
      return true;
    } catch (err: any) {
      console.error('[memory] Init failed:', err.message);
      return false;
    }
  }

  /**
   * Store a conversation turn in the helix
   */
  async storeTurn(
    content: string,
    role: 'user' | 'assistant',
    agentName: string,
    sessionId: string
  ): Promise<string | null> {
    if (!this.initialized) return null;

    try {
      const layer = role === 'user' ? 'episodic' : 'procedural';
      const source = `${agentName}:${sessionId}`;
      const score = role === 'assistant' ? 6 : 4; // Agent responses scored higher

      const result = await NousMemoryBridge.store(content, layer, source, score);
      return result?.id || null;
    } catch (err: any) {
      console.error('[memory] Store failed:', err.message);
      return null;
    }
  }

  /**
   * Recall relevant memories for context building
   * Called before each LLM request to inject relevant history
   */
  async recall(query: string, topK: number = 5): Promise<RecallResult[]> {
    if (!this.initialized) return [];

    try {
      const results = await NousMemoryBridge.recall(query, topK);
      return results || [];
    } catch (err: any) {
      console.error('[memory] Recall failed:', err.message);
      return [];
    }
  }

  /**
   * Get memory health metrics
   */
  async getHealth(): Promise<MemoryHealth> {
    if (!this.initialized) {
      return { diversity: 0, isCollapsing: false, memoryCount: 0, capacity: 0 };
    }

    try {
      return await NousMemoryBridge.getHealth();
    } catch {
      return { diversity: 0, isCollapsing: false, memoryCount: 0, capacity: 0 };
    }
  }

  /**
   * Get total memory count
   */
  async getCount(): Promise<number> {
    if (!this.initialized) return 0;
    try {
      return await NousMemoryBridge.getMemoryCount();
    } catch {
      return 0;
    }
  }

  /**
   * Persist memory to encrypted local storage
   */
  async saveToDisk(): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const serialized = await NousMemoryBridge.serialize();
      if (serialized) {
        const AsyncStorage = require('@react-native-async-storage/async-storage').default;
        await AsyncStorage.setItem('alpenglow_memory_blob', serialized);
        return true;
      }
      return false;
    } catch (err: any) {
      console.error('[memory] Save failed:', err.message);
      return false;
    }
  }

  /**
   * Load memory from encrypted local storage
   */
  async loadFromDisk(): Promise<boolean> {
    try {
      const AsyncStorage = require('@react-native-async-storage/async-storage').default;
      const blob = await AsyncStorage.getItem('alpenglow_memory_blob');
      if (!blob) return false;

      const state = deviceManager.getState();
      const fingerprint = await deviceManager.getDeviceFingerprint();
      const licenseKey = state?.licenseKey || 'dev-mode-key';

      const result = await NousMemoryBridge.deserialize(blob, licenseKey, fingerprint);
      return result?.success || false;
    } catch (err: any) {
      console.error('[memory] Load failed:', err.message);
      return false;
    }
  }

  /**
   * Build context for LLM call by recalling relevant memories
   * Returns formatted context string to inject into system prompt
   */
  async buildContext(userMessage: string, agentName: string): Promise<string> {
    const memories = await this.recall(userMessage, 5);
    if (memories.length === 0) return '';

    let context = '\n\n[Relevant memories from previous interactions:]\n';
    for (const mem of memories) {
      context += `- ${mem.text}\n`;
    }
    context += '[End of memory context]\n';

    return context;
  }

  /**
   * Export memory data for sync with another device
   */
  async exportForSync(): Promise<string | null> {
    if (!this.initialized) return null;
    try {
      return await NousMemoryBridge.serialize();
    } catch {
      return null;
    }
  }

  /**
   * Import memory data from another device
   */
  async importFromSync(data: string): Promise<boolean> {
    if (!this.initialized) return false;
    try {
      const state = deviceManager.getState();
      const fingerprint = await deviceManager.getDeviceFingerprint();
      const licenseKey = state?.licenseKey || 'dev-mode-key';

      const result = await NousMemoryBridge.deserialize(data, licenseKey, fingerprint);
      return result?.success || false;
    } catch {
      return false;
    }
  }

  isReady(): boolean {
    return this.initialized;
  }
}

export const memoryService = new MemoryService();
