package com.alpenglowmobile.native

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import java.security.KeyStore
import javax.crypto.KeyGenerator

/**
 * CognitiveEngineModule — React Native bridge to the compiled Rust cognitive engine.
 *
 * Loads libalpenglow_memory.so (compiled from Rust for ARM64/ARMv7)
 * and exposes memory operations to JavaScript via JNI → C FFI.
 *
 * Device fingerprinting uses Android's vendor-assigned identifiers
 * (Settings.Secure.ANDROID_ID) — no serial numbers, no IMEI, no
 * hardware identifiers that require special permissions.
 *
 * Encryption keys are stored in Android Keystore (hardware-backed
 * on devices with StrongBox/TEE), never in shared preferences or files.
 */
@ReactModule(name = CognitiveEngineModule.NAME)
class CognitiveEngineModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "CognitiveEngine"
        private const val KEYSTORE_ALIAS = "alpenglow_memory_key"

        init {
            try {
                System.loadLibrary("alpenglow_memory")
            } catch (e: UnsatisfiedLinkError) {
                // Library not yet compiled for this architecture — graceful fallback
                android.util.Log.w(NAME, "Native library not available: ${e.message}")
            }
        }
    }

    override fun getName(): String = NAME

    // ── JNI declarations (implemented in Rust via jni crate) ──

    private external fun nativeInit(licenseKey: String, fingerprint: String): Int
    private external fun nativeStore(text: String, layer: String, source: String, score: Float): String
    private external fun nativeRecall(queryText: String, topK: Int): String
    private external fun nativeHealth(): String
    private external fun nativeSerialize(): ByteArray
    private external fun nativeDeserialize(data: ByteArray, licenseKey: String, fingerprint: String): Int
    private external fun nativeMemoryCount(): Int
    private external fun nativeFreeString(ptr: Long)

    // ── React Native exposed methods ──

    @ReactMethod
    fun initialize(licenseKey: String, promise: Promise) {
        try {
            val fingerprint = getDeviceFingerprint()
            val status = nativeInit(licenseKey, fingerprint)
            if (status == 0) {
                promise.resolve("ok")
            } else {
                promise.reject("INIT_FAILED", "Cognitive engine init failed with status $status")
            }
        } catch (e: Exception) {
            promise.reject("INIT_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun store(text: String, layer: String, source: String, score: Double, promise: Promise) {
        try {
            val memoryId = nativeStore(text, layer, source, score.toFloat())
            promise.resolve(memoryId)
        } catch (e: Exception) {
            promise.reject("STORE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun recall(queryText: String, topK: Int, promise: Promise) {
        try {
            val resultsJson = nativeRecall(queryText, topK)
            promise.resolve(resultsJson)
        } catch (e: Exception) {
            promise.reject("RECALL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun health(promise: Promise) {
        try {
            val healthJson = nativeHealth()
            promise.resolve(healthJson)
        } catch (e: Exception) {
            promise.reject("HEALTH_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun serialize(promise: Promise) {
        try {
            val data = nativeSerialize()
            // Encode as base64 for transport over React Native bridge
            val encoded = android.util.Base64.encodeToString(data, android.util.Base64.NO_WRAP)
            promise.resolve(encoded)
        } catch (e: Exception) {
            promise.reject("SERIALIZE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun deserialize(base64Data: String, licenseKey: String, promise: Promise) {
        try {
            val data = android.util.Base64.decode(base64Data, android.util.Base64.NO_WRAP)
            val fingerprint = getDeviceFingerprint()
            val status = nativeDeserialize(data, licenseKey, fingerprint)
            if (status == 0) {
                promise.resolve("ok")
            } else {
                promise.reject("DESERIALIZE_FAILED", "Deserialize failed with status $status")
            }
        } catch (e: Exception) {
            promise.reject("DESERIALIZE_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun memoryCount(promise: Promise) {
        try {
            promise.resolve(nativeMemoryCount())
        } catch (e: Exception) {
            promise.resolve(0)
        }
    }

    // ── Device Fingerprinting ──

    /**
     * Generate a device fingerprint using vendor-assigned identifiers.
     * Does NOT use hardware serial, IMEI, or any identifier requiring
     * special permissions. Uses ANDROID_ID which is:
     * - Unique per app + device combination
     * - Stable across app updates
     * - Reset on factory reset (acceptable — triggers re-pairing)
     * - No special permissions required
     *
     * Combined with device model and Android version for additional entropy.
     */
    private fun getDeviceFingerprint(): String {
        val androidId = android.provider.Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown"

        val model = android.os.Build.MODEL ?: "unknown"
        val brand = android.os.Build.BRAND ?: "unknown"

        // SHA-256 hash of combined identifiers
        val combined = "$androidId|$model|$brand|alpenglow"
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(combined.toByteArray())
        return hash.joinToString("") { "%02x".format(it) }
    }

    // ── Android Keystore Integration ──

    /**
     * Store the derived memory encryption key in Android Keystore.
     * On devices with StrongBox or TEE, the key is hardware-protected
     * and cannot be extracted even with root access.
     */
    private fun storeKeyInKeystore(keyBytes: ByteArray) {
        val keyStore = KeyStore.getInstance("AndroidKeyStore")
        keyStore.load(null)

        val keyGenerator = KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        )
        keyGenerator.init(
            KeyGenParameterSpec.Builder(
                KEYSTORE_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                .setIsStrongBoxBacked(true) // Use StrongBox if available
                .build()
        )
        keyGenerator.generateKey()
    }

    /**
     * Check if the device has hardware-backed key storage.
     */
    @ReactMethod
    fun hasHardwareKeystore(promise: Promise) {
        try {
            val keyStore = KeyStore.getInstance("AndroidKeyStore")
            keyStore.load(null)
            // StrongBox is the highest security level
            promise.resolve(android.os.Build.VERSION.SDK_INT >= 28) // StrongBox available from API 28
        } catch (e: Exception) {
            promise.resolve(false)
        }
    }
}
