package com.alpenglowmobile.sync

import com.facebook.react.bridge.*
import com.facebook.react.module.annotations.ReactModule
import com.facebook.react.modules.core.DeviceEventManagerModule
import java.net.HttpURLConnection
import java.net.URL
import javax.net.ssl.HttpsURLConnection

/**
 * DeviceSyncModule — Cross-device synchronization for Android.
 *
 * Implements the satellite side of the phone-as-anchor pairing protocol:
 * - When Android is ANCHOR: approves pairing requests, issues sync tokens
 * - When Android is SATELLITE to a desktop: requests pairing, receives sync
 *
 * Delta synchronization uses encrypted packets containing only changes
 * since the last sync cursor. Typical delta: 1-5KB per conversation turn.
 *
 * Sync channels (prioritized):
 * 1. Local network (same WiFi) — direct TCP, lowest latency
 * 2. Cloud relay — via Alpenglow cloud server, works across networks
 * 3. Bluetooth — future, for offline peer-to-peer sync
 */
@ReactModule(name = DeviceSyncModule.NAME)
class DeviceSyncModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    companion object {
        const val NAME = "DeviceSync"
    }

    override fun getName(): String = NAME

    // ── Pairing Protocol ──

    /**
     * Initiate pairing with a desktop (this device becomes anchor).
     * Desktop shows a pairing code; user enters it here to confirm.
     */
    @ReactMethod
    fun approvePairing(pairingCode: String, deviceName: String, promise: Promise) {
        try {
            // Validate pairing code against cloud coordination service
            val cloudUrl = getCloudUrl()
            val connection = URL("$cloudUrl/auth/approve-pairing").openConnection() as HttpsURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true

            val body = """{"pairingCode":"$pairingCode","deviceName":"$deviceName","anchorFingerprint":"${getFingerprint()}"}"""
            connection.outputStream.write(body.toByteArray())

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                val response = connection.inputStream.bufferedReader().readText()
                promise.resolve(response)
            } else {
                promise.reject("PAIRING_FAILED", "Server returned $responseCode")
            }
            connection.disconnect()
        } catch (e: Exception) {
            promise.reject("PAIRING_ERROR", e.message, e)
        }
    }

    /**
     * Request pairing to an anchor device (this device becomes satellite).
     * Sends request to cloud, which pushes notification to the anchor phone.
     */
    @ReactMethod
    fun requestPairing(email: String, promise: Promise) {
        try {
            val cloudUrl = getCloudUrl()
            val connection = URL("$cloudUrl/auth/request-pairing").openConnection() as HttpsURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true

            val fingerprint = getFingerprint()
            val deviceName = "${android.os.Build.MANUFACTURER} ${android.os.Build.MODEL}"
            val body = """{"email":"$email","fingerprint":"$fingerprint","deviceName":"$deviceName","platform":"android"}"""
            connection.outputStream.write(body.toByteArray())

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                promise.resolve("Pairing request sent. Check your anchor device to approve.")
            } else {
                promise.reject("REQUEST_FAILED", "Server returned $responseCode")
            }
            connection.disconnect()
        } catch (e: Exception) {
            promise.reject("REQUEST_ERROR", e.message, e)
        }
    }

    // ── Delta Synchronization ──

    /**
     * Push local changes to paired device via cloud relay.
     * Delta contains only memories modified since last sync cursor.
     */
    @ReactMethod
    fun pushDelta(deltaBase64: String, targetDeviceId: String, promise: Promise) {
        try {
            val cloudUrl = getCloudUrl()
            val connection = URL("$cloudUrl/sync/push").openConnection() as HttpsURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true

            val body = """{"delta":"$deltaBase64","targetDevice":"$targetDeviceId","sourceFingerprint":"${getFingerprint()}"}"""
            connection.outputStream.write(body.toByteArray())

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                promise.resolve("Delta pushed successfully")
            } else {
                promise.reject("PUSH_FAILED", "Server returned $responseCode")
            }
            connection.disconnect()
        } catch (e: Exception) {
            promise.reject("PUSH_ERROR", e.message, e)
        }
    }

    /**
     * Pull pending deltas from paired device.
     */
    @ReactMethod
    fun pullDelta(promise: Promise) {
        try {
            val cloudUrl = getCloudUrl()
            val fingerprint = getFingerprint()
            val connection = URL("$cloudUrl/sync/pull?device=$fingerprint").openConnection() as HttpsURLConnection
            connection.requestMethod = "GET"

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                val response = connection.inputStream.bufferedReader().readText()
                promise.resolve(response)
            } else if (responseCode == 204) {
                promise.resolve(null) // No pending deltas
            } else {
                promise.reject("PULL_FAILED", "Server returned $responseCode")
            }
            connection.disconnect()
        } catch (e: Exception) {
            promise.reject("PULL_ERROR", e.message, e)
        }
    }

    // ── Local Inference Routing ──

    /**
     * Check if the user's desktop/local inference endpoint is reachable.
     * Pings the local hardware on the configured endpoint.
     */
    @ReactMethod
    fun checkLocalInference(endpoint: String, promise: Promise) {
        Thread {
            try {
                val connection = URL("$endpoint/health").openConnection() as HttpURLConnection
                connection.connectTimeout = 3000
                connection.readTimeout = 3000
                connection.requestMethod = "GET"

                val responseCode = connection.responseCode
                connection.disconnect()

                if (responseCode == 200) {
                    promise.resolve(true)
                } else {
                    promise.resolve(false)
                }
            } catch (e: Exception) {
                promise.resolve(false)
            }
        }.start()
    }

    /**
     * Route an inference request to local hardware.
     * Sends the request over encrypted channel to user's desktop.
     */
    @ReactMethod
    fun routeLocalInference(endpoint: String, requestJson: String, promise: Promise) {
        Thread {
            try {
                val connection = URL("$endpoint/v1/chat/completions").openConnection() as HttpURLConnection
                connection.requestMethod = "POST"
                connection.setRequestProperty("Content-Type", "application/json")
                connection.connectTimeout = 10000
                connection.readTimeout = 120000 // LLM inference can take time
                connection.doOutput = true

                connection.outputStream.write(requestJson.toByteArray())

                val responseCode = connection.responseCode
                if (responseCode == 200) {
                    val response = connection.inputStream.bufferedReader().readText()
                    promise.resolve(response)
                } else {
                    promise.reject("INFERENCE_FAILED", "Local inference returned $responseCode")
                }
                connection.disconnect()
            } catch (e: Exception) {
                promise.reject("INFERENCE_ERROR", e.message, e)
            }
        }.start()
    }

    // ── Device Management ──

    /**
     * List all paired devices for this account.
     */
    @ReactMethod
    fun listPairedDevices(promise: Promise) {
        try {
            val cloudUrl = getCloudUrl()
            val fingerprint = getFingerprint()
            val connection = URL("$cloudUrl/auth/devices?fingerprint=$fingerprint").openConnection() as HttpsURLConnection
            connection.requestMethod = "GET"

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                val response = connection.inputStream.bufferedReader().readText()
                promise.resolve(response)
            } else {
                promise.reject("LIST_FAILED", "Server returned $responseCode")
            }
            connection.disconnect()
        } catch (e: Exception) {
            promise.reject("LIST_ERROR", e.message, e)
        }
    }

    /**
     * Revoke a paired device's access.
     */
    @ReactMethod
    fun revokeDevice(deviceFingerprint: String, promise: Promise) {
        try {
            val cloudUrl = getCloudUrl()
            val connection = URL("$cloudUrl/auth/revoke-device").openConnection() as HttpsURLConnection
            connection.requestMethod = "POST"
            connection.setRequestProperty("Content-Type", "application/json")
            connection.doOutput = true

            val body = """{"deviceFingerprint":"$deviceFingerprint","anchorFingerprint":"${getFingerprint()}"}"""
            connection.outputStream.write(body.toByteArray())

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                promise.resolve("Device revoked")
            } else {
                promise.reject("REVOKE_FAILED", "Server returned $responseCode")
            }
            connection.disconnect()
        } catch (e: Exception) {
            promise.reject("REVOKE_ERROR", e.message, e)
        }
    }

    // ── Helpers ──

    private fun getFingerprint(): String {
        val androidId = android.provider.Settings.Secure.getString(
            reactApplicationContext.contentResolver,
            android.provider.Settings.Secure.ANDROID_ID
        ) ?: "unknown"
        val model = android.os.Build.MODEL ?: "unknown"
        val brand = android.os.Build.BRAND ?: "unknown"
        val combined = "$androidId|$model|$brand|alpenglow"
        val digest = java.security.MessageDigest.getInstance("SHA-256")
        val hash = digest.digest(combined.toByteArray())
        return hash.joinToString("") { "%02x".format(it) }
    }

    private fun getCloudUrl(): String {
        // Read from React Native shared preferences or default
        val prefs = reactApplicationContext.getSharedPreferences("alpenglow", 0)
        return prefs.getString("cloudUrl", "https://alpenglow.onrender.com") ?: "https://alpenglow.onrender.com"
    }
}
