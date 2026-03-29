package com.alpenglowmobile.native

import com.facebook.react.ReactPackage
import com.facebook.react.bridge.NativeModule
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.uimanager.ViewManager
import com.alpenglowmobile.sync.DeviceSyncModule
import com.alpenglowmobile.tools.NativeToolsModule

/**
 * AlpenglowPackage — Registers all native modules with React Native.
 *
 * Three modules:
 * 1. CognitiveEngine — Rust FFI bridge for holographic memory
 * 2. DeviceSync — Cross-device pairing, delta sync, inference routing
 * 3. NativeTools — Android system integration (calendar, contacts, SMS, etc.)
 */
class AlpenglowPackage : ReactPackage {

    override fun createNativeModules(reactContext: ReactApplicationContext): List<NativeModule> {
        return listOf(
            CognitiveEngineModule(reactContext),
            DeviceSyncModule(reactContext),
            NativeToolsModule(reactContext),
        )
    }

    override fun createViewManagers(reactContext: ReactApplicationContext): List<ViewManager<*, *>> {
        return emptyList()
    }
}
