/**
 * App Bootstrap — initializes the entire system on launch
 * 
 * Boot sequence:
 * 1. Load device state (license, fingerprint)
 * 2. Initialize Rust cognitive engine via FFI
 * 3. Load persisted memory from encrypted storage
 * 4. Start delta sync service
 * 5. Start transpiration health monitoring
 * 6. Register Siri intents
 * 7. Ready for user interaction
 */

import { deviceManager } from './DeviceManager';
import { memoryService } from './MemoryService';
import { syncService } from './SyncService';
import { NativeModules, Platform } from 'react-native';

export interface BootStatus {
  phase: string;
  progress: number; // 0-100
  error?: string;
}

type BootCallback = (status: BootStatus) => void;

export async function bootstrap(onProgress?: BootCallback): Promise<boolean> {
  try {
    // Phase 1: Device state
    onProgress?.({ phase: 'Loading device state...', progress: 10 });
    const deviceState = await deviceManager.load();
    
    if (!deviceState) {
      // First launch — setup flow will handle this
      onProgress?.({ phase: 'First launch — setup required', progress: 100 });
      return false;
    }

    // Phase 2: Initialize cognitive engine
    onProgress?.({ phase: 'Starting cognitive engine...', progress: 25 });
    const memoryOk = await memoryService.init();
    
    if (!memoryOk) {
      console.warn('[boot] Memory engine failed — running in degraded mode');
      // Continue without memory — LLM calls still work, just no persistence
    }

    // Phase 3: Load persisted memory
    onProgress?.({ phase: 'Loading memories...', progress: 40 });
    if (memoryOk) {
      const count = await memoryService.getCount();
      console.log(`[boot] Loaded ${count} memories`);
    }

    // Phase 4: Start sync
    onProgress?.({ phase: 'Starting sync service...', progress: 55 });
    await syncService.start();

    // Phase 5: Transpiration
    onProgress?.({ phase: 'Starting health monitoring...', progress: 70 });
    if (memoryOk) {
      const health = await memoryService.getHealth();
      console.log(`[boot] Memory health: diversity=${health.diversity.toFixed(2)}, count=${health.memoryCount}`);
      
      if (health.isCollapsing) {
        console.warn('[boot] ⚠ Memory diversity is low — running anti-collapse repair');
        // The Rust engine handles repair internally
      }
    }

    // Phase 6: Register Siri intents (iOS only)
    if (Platform.OS === 'ios') {
      onProgress?.({ phase: 'Registering Siri intents...', progress: 85 });
      try {
        // Donate common interactions to Siri for suggestions
        const { SiriShortcutsBridge } = NativeModules;
        if (SiriShortcutsBridge) {
          await SiriShortcutsBridge.donateInteraction('Ask Silas', 'Send a message to your AI agent');
        }
      } catch (err: any) {
        // Siri registration is non-critical
        console.debug("[sync] caught:", err?.message);
      }
    }

    // Phase 7: Ready
    onProgress?.({ phase: 'Ready', progress: 100 });
    console.log('[boot] Alpenglow Mobile ready');
    return true;

  } catch (err: any) {
    console.error('[boot] Bootstrap failed:', err);
    onProgress?.({ phase: `Error: ${err.message}`, progress: 0, error: err.message });
    return false;
  }
}

/**
 * Graceful shutdown — persist everything before app closes
 */
export async function shutdown(): Promise<void> {
  console.log('[shutdown] Saving state...');
  
  // Stop sync
  syncService.stop();
  
  // Persist memory to disk
  await memoryService.saveToDisk();
  
  // Save device state
  await deviceManager.save();
  
  console.log('[shutdown] Complete');
}
