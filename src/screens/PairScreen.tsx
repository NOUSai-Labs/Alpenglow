/**
 * PairScreen — Device pairing UI
 *
 * Handles the full pairing flow from both ends:
 *   On phone:   "Pair with Desktop" — scans for nearby desktops via mDNS,
 *               falls back to QR camera scan or manual entry
 *   On desktop: This screen is not shown (desktop has its own web UI)
 *
 * Flow:
 *   1. Scanning — animated radar, tries mDNS + localhost probes
 *   2. Found — list of nearby Alpenglow desktops
 *   3. Confirming — show 6-digit code, user verifies it matches desktop
 *   4. Downloading — progress bar, copying config from desktop
 *   5. Done — fade to main app
 *
 * QR fallback:
 *   Camera scans desktop's QR code → parses alpenglow://pair?... URL
 *   → skips straight to confirming step
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet, Animated,
  ScrollView, TextInput, ActivityIndicator, Platform,
  Dimensions, SafeAreaView,
} from 'react-native';
import { PairingService, DiscoveredDevice, PairingStatus, PairingPayload } from '../services/PairingService';
import { useTheme } from '../hooks/useTheme';

interface PairScreenProps {
  onComplete: (payload: PairingPayload) => void;
  onCancel: () => void;
}

export default function PairScreen({ onComplete, onCancel }: PairScreenProps) {
  const { colors } = useTheme();
  const [status, setStatus] = useState<PairingStatus>({ phase: 'idle' });
  const [selectedDevice, setSelectedDevice] = useState<DiscoveredDevice | null>(null);
  const [showQR, setShowQR] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualHost, setManualHost] = useState('localhost');
  const [manualPort, setManualPort] = useState('19820');
  const [error, setError] = useState('');
  const [userConfirmed, setUserConfirmed] = useState(false);

  // Radar animation
  const radarAnim = useRef(new Animated.Value(0)).current;
  const radarLoop = useRef<Animated.CompositeAnimation | null>(null);

  function startRadar() {
    radarAnim.setValue(0);
    radarLoop.current = Animated.loop(
      Animated.timing(radarAnim, { toValue: 1, duration: 2200, useNativeDriver: true })
    );
    radarLoop.current.start();
  }

  function stopRadar() {
    radarLoop.current?.stop();
    radarAnim.setValue(0);
  }

  // Progress bar animation
  const progressAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (status.phase === 'downloading') {
      Animated.timing(progressAnim, {
        toValue: status.progress,
        duration: 400,
        useNativeDriver: false,
      }).start();
    }
  }, [status]);

  // Start scanning on mount
  useEffect(() => {
    PairingService.setStatusListener(setStatus);
    startScan();
    return () => {
      PairingService.stopScan();
      PairingService.setStatusListener(() => {});
      stopRadar();
    };
  }, []);

  async function startScan() {
    setError('');
    startRadar();
    await PairingService.startScan();
  }

  async function connectToDevice(device: DiscoveredDevice) {
    setSelectedDevice(device);
    setError('');
    try {
      await PairingService.connect(device);
      // Status is now 'confirming' — user sees 6-digit code
    } catch (err: any) {
      setError(err.message);
      setStatus({ phase: 'found', devices: status.phase === 'found' ? status.devices : [] });
    }
  }

  async function confirmCode() {
    if (status.phase !== 'confirming' || !selectedDevice) return;
    setUserConfirmed(true);
    try {
      const payload = await PairingService.confirmAndDownload(
        selectedDevice,
        selectedDevice.pairingToken,
      );
      onComplete(payload);
    } catch (err: any) {
      setUserConfirmed(false);
      setError(err.message);
      setStatus({ phase: 'confirming', device: selectedDevice, verifyCode: status.verifyCode });
    }
  }

  async function handleManualProbe() {
    setError('');
    const trimmed = manualHost.trim();

    // If user pasted a full alpenglow://pair?... deep link, parse it as QR
    if (trimmed.startsWith('alpenglow://')) {
      const device = PairingService.parseQR(trimmed);
      if (device) {
        setShowManual(false);
        setStatus({ phase: 'found', devices: [device] });
        return;
      } else {
        setError('Could not parse pairing link — make sure you copied the full URL');
        return;
      }
    }

    const port = parseInt(manualPort) || 19820;
    setStatus({ phase: 'scanning' });
    const device = await PairingService.probeManual(trimmed, port);
    if (device) {
      setShowManual(false);
      setStatus({ phase: 'found', devices: [device] });
    } else {
      setError(`No Alpenglow found at ${trimmed}:${port}`);
      setStatus({ phase: 'idle' });
    }
  }

  // ── Render helpers ────────────────────────────────────────────────────────

  function renderScanning() {
    const scale = radarAnim.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1.8] });
    const opacity = radarAnim.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.8, 0.3, 0] });

    return (
      <View style={styles.scanCenter}>
        <View style={styles.radarContainer}>
          {/* Pulse rings */}
          {[0.25, 0.5, 0.75, 1].map((delay, i) => (
            <Animated.View
              key={i}
              style={[
                styles.radarRing,
                {
                  borderColor: colors.accent + '60',
                  opacity: radarAnim.interpolate({
                    inputRange: [0, delay, Math.min(delay + 0.3, 1), 1],
                    outputRange: [0, 0.6, 0, 0],
                    extrapolate: 'clamp',
                  }),
                  transform: [{
                    scale: radarAnim.interpolate({
                      inputRange: [0, delay, 1],
                      outputRange: [0.2, delay * 1.5, 2],
                      extrapolate: 'clamp',
                    }),
                  }],
                },
              ]}
            />
          ))}

          {/* Center dot */}
          <View style={[styles.radarCenter, { backgroundColor: colors.accent }]}>
            <Text style={styles.radarIcon}>🏔️</Text>
          </View>
        </View>

        <Text style={[styles.scanTitle, { color: colors.text }]}>
          Searching for Alpenglow
        </Text>
        <Text style={[styles.scanSubtitle, { color: colors.textSecondary }]}>
          Looking for nearby desktops on your network
        </Text>

        <View style={styles.scanActions}>
          <TouchableOpacity
            onPress={() => setShowQR(true)}
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>📷  Scan QR Code</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowManual(true)}
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface }]}>
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>⌨️  Enter Manually</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  function renderFound(devices: DiscoveredDevice[]) {
    if (devices.length === 0) {
      return (
        <View style={styles.scanCenter}>
          <Text style={styles.notFoundEmoji}>🔍</Text>
          <Text style={[styles.scanTitle, { color: colors.text }]}>No devices found</Text>
          <Text style={[styles.scanSubtitle, { color: colors.textSecondary }]}>
            Make sure your desktop is open and on the same network, or use QR code pairing.
          </Text>
          <TouchableOpacity
            onPress={startScan}
            style={[styles.primaryBtn, { backgroundColor: colors.accent }]}>
            <Text style={styles.primaryBtnText}>Try Again</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowQR(true)}
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: 10 }]}>
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>📷  Scan QR Code Instead</Text>
          </TouchableOpacity>
          <TouchableOpacity
            onPress={() => setShowManual(true)}
            style={[styles.secondaryBtn, { borderColor: colors.border, backgroundColor: colors.surface, marginTop: 10 }]}>
            <Text style={[styles.secondaryBtnText, { color: colors.text }]}>⌨️  Enter Address Manually</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.content}>
        <Text style={[styles.stepTitle, { color: colors.text }]}>
          {devices.length === 1 ? 'Desktop found!' : `${devices.length} desktops found`}
        </Text>
        <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
          Select your desktop to begin pairing
        </Text>
        <ScrollView style={styles.deviceList}>
          {devices.map((device, i) => (
            <TouchableOpacity
              key={i}
              onPress={() => connectToDevice(device)}
              style={[styles.deviceCard, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={[styles.deviceIcon, { backgroundColor: colors.accent + '20' }]}>
                <Text style={styles.deviceIconText}>💻</Text>
              </View>
              <View style={styles.deviceInfo}>
                <Text style={[styles.deviceName, { color: colors.text }]}>{device.name}</Text>
                <Text style={[styles.deviceHost, { color: colors.textSecondary }]}>
                  {device.host}:{device.port}  ·  ID: {device.shortCode}
                </Text>
              </View>
              <Text style={[styles.connectArrow, { color: colors.accent }]}>›</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>
    );
  }

  function renderConfirming(device: DiscoveredDevice, verifyCode: string) {
    // Format code as groups: 123 456
    const formatted = verifyCode.slice(0, 3) + '  ' + verifyCode.slice(3, 6);

    return (
      <View style={styles.content}>
        <View style={[styles.confirmIcon, { backgroundColor: colors.accentGreen + '20' }]}>
          <Text style={styles.confirmIconText}>🔐</Text>
        </View>
        <Text style={[styles.stepTitle, { color: colors.text }]}>Verify Pairing</Text>
        <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
          Check that this code matches what's shown on{'\n'}
          <Text style={[{ color: colors.text, fontWeight: '700' }]}>{device.name}</Text>
        </Text>

        <View style={[styles.codeBox, { backgroundColor: colors.surface, borderColor: colors.accent }]}>
          <Text style={[styles.codeText, { color: colors.text }]}>{formatted}</Text>
          <Text style={[styles.codeLabel, { color: colors.textSecondary }]}>
            Verification code
          </Text>
        </View>

        <Text style={[styles.verifyHint, { color: colors.textSecondary }]}>
          This code proves you're connecting to YOUR desktop.{'\n'}
          Never share this code with anyone.
        </Text>

        <TouchableOpacity
          onPress={confirmCode}
          disabled={userConfirmed}
          style={[styles.primaryBtn, {
            backgroundColor: userConfirmed ? colors.border : colors.accentGreen,
          }]}>
          {userConfirmed
            ? <ActivityIndicator size="small" color="#fff" />
            : <Text style={styles.primaryBtnText}>✓  Codes Match — Connect</Text>
          }
        </TouchableOpacity>

        <TouchableOpacity
          onPress={() => { setSelectedDevice(null); startScan(); }}
          style={styles.cancelLink}>
          <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>
            Codes don't match — cancel
          </Text>
        </TouchableOpacity>
      </View>
    );
  }

  function renderDownloading(device: DiscoveredDevice, progress: number) {
    const messages = [
      'Connecting securely...',
      'Copying account settings...',
      'Downloading agent configurations...',
      'Syncing memory index...',
      'Almost done...',
    ];
    const msgIndex = Math.min(Math.floor(progress * messages.length), messages.length - 1);
    const progressWidth = progressAnim.interpolate({
      inputRange: [0, 1], outputRange: ['0%', '100%'],
    });

    return (
      <View style={styles.content}>
        <ActivityIndicator size="large" color={colors.accent} style={styles.downloadSpinner} />
        <Text style={[styles.stepTitle, { color: colors.text }]}>Pairing in progress</Text>
        <Text style={[styles.stepSubtitle, { color: colors.textSecondary }]}>
          {messages[msgIndex]}
        </Text>
        <View style={[styles.progressTrack, { backgroundColor: colors.surfaceAlt }]}>
          <Animated.View
            style={[styles.progressFill, { width: progressWidth, backgroundColor: colors.accent }]}
          />
        </View>
        <Text style={[styles.progressLabel, { color: colors.textSecondary }]}>
          {Math.round(progress * 100)}%
        </Text>
      </View>
    );
  }

  function renderManualEntry() {
    return (
      <View style={[styles.modal, { backgroundColor: colors.surface }]}>
        <Text style={[styles.modalTitle, { color: colors.text }]}>Enter Desktop Address</Text>
        <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
          Paste the full pairing link from the 📱 button on your desktop, or enter the IP + port manually.
        </Text>

        <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Pairing Link or Host / IP</Text>
        <TextInput
          value={manualHost}
          onChangeText={setManualHost}
          placeholder="alpenglow://pair?...  or  192.168.1.x"
          placeholderTextColor={colors.textSecondary}
          style={[styles.manualInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="url"
          multiline
        />

        {!manualHost.startsWith('alpenglow://') && (
          <>
            <Text style={[styles.fieldLabel, { color: colors.textSecondary }]}>Port</Text>
            <TextInput
              value={manualPort}
              onChangeText={setManualPort}
              placeholder="19820"
              placeholderTextColor={colors.textSecondary}
              style={[styles.manualInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
              keyboardType="number-pad"
            />
          </>
        )}

        {error ? (
          <Text style={[styles.errorText, { color: colors.accentRed }]}>{error}</Text>
        ) : null}

        <TouchableOpacity
          onPress={handleManualProbe}
          style={[styles.primaryBtn, { backgroundColor: colors.accent }]}>
          <Text style={styles.primaryBtnText}>Connect</Text>
        </TouchableOpacity>
        <TouchableOpacity
          onPress={() => { setShowManual(false); setError(''); }}
          style={styles.cancelLink}>
          <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  // ── Main render ───────────────────────────────────────────────────────────

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={onCancel} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={[styles.headerBack, { color: colors.textSecondary }]}>← Back</Text>
        </TouchableOpacity>
        <Text style={[styles.headerTitle, { color: colors.text }]}>Pair with Desktop</Text>
        <View style={{ width: 60 }} />
      </View>

      {/* Content */}
      <View style={styles.body}>
        {error && status.phase !== 'confirming' ? (
          <View style={[styles.errorBanner, { backgroundColor: colors.accentRed + '20' }]}>
            <Text style={[styles.errorBannerText, { color: colors.accentRed }]}>{error}</Text>
          </View>
        ) : null}

        {status.phase === 'idle' && renderScanning()}
        {status.phase === 'scanning' && renderScanning()}
        {status.phase === 'found' && renderFound(status.devices)}
        {status.phase === 'connecting' && (
          <View style={styles.scanCenter}>
            <ActivityIndicator size="large" color={colors.accent} />
            <Text style={[styles.scanTitle, { color: colors.text, marginTop: 20 }]}>
              Connecting to {status.device.name}...
            </Text>
          </View>
        )}
        {status.phase === 'confirming' && renderConfirming(status.device, status.verifyCode)}
        {status.phase === 'downloading' && renderDownloading(status.device, status.progress)}

        {/* Modals */}
        {showManual && (
          <View style={styles.modalOverlay}>
            {renderManualEntry()}
          </View>
        )}

        {showQR && (
          <View style={styles.modalOverlay}>
            <View style={[styles.modal, { backgroundColor: colors.surface }]}>
              <Text style={[styles.modalTitle, { color: colors.text }]}>Scan QR Code</Text>
              <Text style={[styles.modalSubtitle, { color: colors.textSecondary }]}>
                Open Alpenglow on your desktop, go to{'\n'}
                Settings → Pair Mobile, then scan the QR code.
              </Text>
              {/* Camera scanner placeholder — requires expo-barcode-scanner or react-native-vision-camera */}
              <View style={[styles.qrPlaceholder, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}>
                <Text style={styles.qrPlaceholderIcon}>📷</Text>
                <Text style={[styles.qrPlaceholderText, { color: colors.textSecondary }]}>
                  Camera scanner{'\n'}(requires camera permission)
                </Text>
              </View>

              {/* Simulator helper — manual QR URL paste */}
              <Text style={[styles.fieldLabel, { color: colors.textSecondary, marginTop: 16 }]}>
                Or paste QR link (for simulator testing):
              </Text>
              <TextInput
                placeholder="alpenglow://pair?host=localhost&port=19820&..."
                placeholderTextColor={colors.textSecondary}
                style={[styles.manualInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                autoCapitalize="none"
                autoCorrect={false}
                onChangeText={(text) => {
                  const device = PairingService.parseQR(text);
                  if (device) {
                    setShowQR(false);
                    setStatus({ phase: 'found', devices: [device] });
                  }
                }}
              />

              <TouchableOpacity
                onPress={() => setShowQR(false)}
                style={styles.cancelLink}>
                <Text style={[styles.cancelLinkText, { color: colors.textSecondary }]}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const { width } = Dimensions.get('window');

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 0.5,
  },
  headerBack: { fontSize: 14, fontWeight: '500', width: 60 },
  headerTitle: { fontSize: 17, fontWeight: '700' },
  body: { flex: 1 },

  // ── Scanning ────────────────────────────────────────────────────────────────
  scanCenter: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 32,
  },
  radarContainer: {
    width: 180,
    height: 180,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  radarRing: {
    position: 'absolute',
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 1.5,
  },
  radarCenter: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 10,
  },
  radarIcon: { fontSize: 26 },
  scanTitle: { fontSize: 22, fontWeight: '700', marginBottom: 10, textAlign: 'center' },
  scanSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 32 },
  notFoundEmoji: { fontSize: 48, marginBottom: 16 },
  scanActions: { width: '100%', gap: 10 },

  // ── Content ─────────────────────────────────────────────────────────────────
  content: {
    flex: 1,
    padding: 24,
    alignItems: 'center',
    paddingTop: 40,
  },
  stepTitle: { fontSize: 22, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  stepSubtitle: { fontSize: 14, textAlign: 'center', lineHeight: 21, marginBottom: 28 },

  // ── Device list ──────────────────────────────────────────────────────────────
  deviceList: { width: '100%' },
  deviceCard: {
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 16,
    borderWidth: 1,
    padding: 16,
    marginBottom: 10,
    gap: 14,
  },
  deviceIcon: { width: 48, height: 48, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  deviceIconText: { fontSize: 22 },
  deviceInfo: { flex: 1 },
  deviceName: { fontSize: 16, fontWeight: '700', marginBottom: 3 },
  deviceHost: { fontSize: 12 },
  connectArrow: { fontSize: 22, fontWeight: '300' },

  // ── Confirming ──────────────────────────────────────────────────────────────
  confirmIcon: { width: 72, height: 72, borderRadius: 22, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  confirmIconText: { fontSize: 34 },
  codeBox: {
    borderRadius: 20,
    borderWidth: 2,
    paddingHorizontal: 36,
    paddingVertical: 24,
    alignItems: 'center',
    marginBottom: 20,
    width: '100%',
  },
  codeText: { fontSize: 42, fontWeight: '800', letterSpacing: 4, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  codeLabel: { fontSize: 12, marginTop: 8, fontWeight: '500' },
  verifyHint: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 28 },

  // ── Downloading ─────────────────────────────────────────────────────────────
  downloadSpinner: { marginBottom: 24 },
  progressTrack: { width: '80%', height: 6, borderRadius: 3, overflow: 'hidden', marginTop: 20 },
  progressFill: { height: '100%', borderRadius: 3 },
  progressLabel: { fontSize: 13, marginTop: 8 },

  // ── Buttons ──────────────────────────────────────────────────────────────────
  primaryBtn: {
    width: '100%',
    padding: 18,
    borderRadius: 16,
    alignItems: 'center',
    marginTop: 4,
  },
  primaryBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryBtn: {
    width: '100%',
    padding: 15,
    borderRadius: 14,
    alignItems: 'center',
    borderWidth: 1,
  },
  secondaryBtnText: { fontSize: 15, fontWeight: '600' },
  cancelLink: { paddingVertical: 16, alignItems: 'center' },
  cancelLinkText: { fontSize: 14 },

  // ── Error ──────────────────────────────────────────────────────────────────
  errorBanner: {
    margin: 16,
    padding: 12,
    borderRadius: 10,
  },
  errorBannerText: { fontSize: 13, textAlign: 'center', fontWeight: '500' },
  errorText: { fontSize: 13, marginBottom: 10, textAlign: 'center' },

  // ── Modals ──────────────────────────────────────────────────────────────────
  modalOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  modal: {
    width: '100%',
    borderRadius: 24,
    padding: 24,
  },
  modalTitle: { fontSize: 20, fontWeight: '700', marginBottom: 8, textAlign: 'center' },
  modalSubtitle: { fontSize: 13, textAlign: 'center', lineHeight: 20, marginBottom: 20 },
  fieldLabel: { fontSize: 12, fontWeight: '600', marginBottom: 6, alignSelf: 'flex-start' },
  manualInput: {
    width: '100%',
    borderRadius: 12,
    padding: 14,
    fontSize: 14,
    borderWidth: 1,
    marginBottom: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  qrPlaceholder: {
    width: '100%',
    height: 200,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  qrPlaceholderIcon: { fontSize: 40 },
  qrPlaceholderText: { fontSize: 13, textAlign: 'center', lineHeight: 20 },
});
