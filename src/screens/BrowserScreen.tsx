/**
 * BrowserScreen — Agent-optimized WKWebView
 *
 * Layout philosophy:
 *   • WebView gets maximum screen real estate — 90%+ of the view
 *   • Minimal chrome strip at top: URL + load indicator only
 *   • Agent activity panel slides up from bottom when agent is active
 *   • Quick-action tray for common agent ops (read, click, scroll, back)
 *   • No nav buttons cluttering the view — agent handles navigation,
 *     user swipes back or taps URL bar to type
 *
 * Agent control flow visible to user:
 *   - Idle: thin address bar, nothing else
 *   - Agent active: bottom panel shows current op + last result
 *   - Agent done: result persists 4s then panel slides away
 */

import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, StyleSheet,
  ActivityIndicator, SafeAreaView, Animated, Platform,
  ScrollView, Dimensions,
} from 'react-native';
import WebView, { WebViewNavigation } from 'react-native-webview';
import { BrowserService } from '../services/BrowserService';
import { useTheme } from '../hooks/useTheme';

const { height: SCREEN_HEIGHT } = Dimensions.get('window');
const PANEL_HEIGHT = 160;

interface AgentState {
  active: boolean;
  op: string;
  status: 'running' | 'done' | 'error';
  result: string;
  stepCount: number;
}

export default function BrowserScreen() {
  const { colors } = useTheme();

  const [urlInput, setUrlInput] = useState('https://www.google.com');
  const [displayUrl, setDisplayUrl] = useState('google.com');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [canGoBack, setCanGoBack] = useState(false);
  const [editingUrl, setEditingUrl] = useState(false);
  const [agent, setAgent] = useState<AgentState>({
    active: false, op: '', status: 'done', result: '', stepCount: 0,
  });

  const progressAnim = useRef(new Animated.Value(0)).current;
  const panelAnim = useRef(new Animated.Value(PANEL_HEIGHT)).current;
  const panelTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const urlInputRef = useRef<TextInput>(null);

  // Register WebView ref with BrowserService
  const registerRef = useCallback((ref: WebView | null) => {
    (BrowserService.webviewRef as any).current = ref;
  }, []);

  // Show agent panel
  function showAgentPanel(op: string, status: 'running' | 'done' | 'error', result = '') {
    if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);

    setAgent(prev => ({
      active: true,
      op,
      status,
      result,
      stepCount: status === 'running' ? prev.stepCount + 1 : prev.stepCount,
    }));

    Animated.spring(panelAnim, {
      toValue: 0,
      useNativeDriver: true,
      tension: 80,
      friction: 12,
    }).start();

    if (status !== 'running') {
      panelTimeoutRef.current = setTimeout(() => {
        Animated.timing(panelAnim, {
          toValue: PANEL_HEIGHT,
          duration: 300,
          useNativeDriver: true,
        }).start(() => setAgent(prev => ({ ...prev, active: false })));
      }, 4000);
    }
  }

  // Wire BrowserService callbacks → agent panel
  useEffect(() => {
    BrowserService.setNavigationCallback((url, pageTitle) => {
      const short = url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 50);
      setDisplayUrl(short);
      setUrlInput(url);
      setTitle(pageTitle);
      showAgentPanel(`Navigate → ${short}`, 'done');
    });

    BrowserService.setLoadCallback((url) => {
      const short = url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 50);
      setDisplayUrl(short);
      setUrlInput(url);
    });

    return () => {
      if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);
    };
  }, []);

  function handleNavigationStateChange(nav: WebViewNavigation) {
    const short = nav.url.replace(/^https?:\/\//, '').replace(/\/$/, '').slice(0, 50);
    setDisplayUrl(short);
    setUrlInput(nav.url);
    setTitle(nav.title || '');
    setCanGoBack(nav.canGoBack);
    setLoading(nav.loading);
    BrowserService.onNavigate(nav.url, nav.title || '');
    if (!nav.loading) BrowserService.onLoad(nav.url);
  }

  function handleLoadStart() {
    setLoading(true);
    Animated.timing(progressAnim, {
      toValue: 0.7, duration: 1500, useNativeDriver: false,
    }).start();
  }

  function handleLoadEnd() {
    setLoading(false);
    Animated.sequence([
      Animated.timing(progressAnim, { toValue: 1, duration: 150, useNativeDriver: false }),
      Animated.timing(progressAnim, { toValue: 0, duration: 250, useNativeDriver: false }),
    ]).start();
  }

  function handleMessage(event: { nativeEvent: { data: string } }) {
    BrowserService.handleMessage(event.nativeEvent.data);
  }

  function commitUrl() {
    const raw = urlInput.trim();
    if (!raw) return;
    const full = raw.startsWith('http') ? raw : raw.includes('.') ? `https://${raw}` : `https://www.google.com/search?q=${encodeURIComponent(raw)}`;
    setEditingUrl(false);
    BrowserService.navigate(full);
  }

  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });

  const statusColor = agent.status === 'running'
    ? colors.accent
    : agent.status === 'error'
    ? colors.accentRed
    : colors.accentGreen;

  return (
    <SafeAreaView style={[styles.container, { backgroundColor: colors.background }]}>

      {/* ── Compact address bar ── */}
      <View style={[styles.addressBar, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <View style={styles.addressRow}>
          {/* Back button — only shows when there's history */}
          {canGoBack && (
            <TouchableOpacity
              onPress={() => BrowserService.back()}
              style={styles.backBtn}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Text style={[styles.backBtnText, { color: colors.textSecondary }]}>‹</Text>
            </TouchableOpacity>
          )}

          {/* URL pill */}
          <TouchableOpacity
            style={[styles.urlPill, { backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
            onPress={() => {
              setEditingUrl(true);
              setTimeout(() => urlInputRef.current?.focus(), 50);
            }}
            activeOpacity={0.8}>
            {loading
              ? <ActivityIndicator size="small" color={colors.accent} style={styles.loadIcon} />
              : <Text style={[styles.loadIcon, { color: colors.textSecondary }]}>🔒</Text>
            }
            {editingUrl ? (
              <TextInput
                ref={urlInputRef}
                value={urlInput}
                onChangeText={setUrlInput}
                onSubmitEditing={commitUrl}
                onBlur={() => setEditingUrl(false)}
                placeholder="Search or enter URL"
                placeholderTextColor={colors.textSecondary}
                style={[styles.urlEditInput, { color: colors.text }]}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="url"
                selectTextOnFocus
                returnKeyType="go"
              />
            ) : (
              <Text style={[styles.urlDisplay, { color: colors.textSecondary }]} numberOfLines={1}>
                {title || displayUrl}
              </Text>
            )}
          </TouchableOpacity>
        </View>

        {/* Progress bar — 2px line at very bottom of bar */}
        <Animated.View
          style={[styles.progressLine, { width: progressWidth, backgroundColor: colors.accent }]}
        />
      </View>

      {/* ── WebView — full remaining height ── */}
      <WebView
        ref={registerRef}
        source={{ uri: 'https://www.google.com' }}
        style={styles.webview}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={handleLoadStart}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        javaScriptEnabled
        injectedJavaScriptBeforeContentLoaded={BRIDGE_SETUP_JS}
        applicationNameForUserAgent="Alpenglow/1.0"
        onShouldStartLoadWithRequest={() => true}
        cacheEnabled
        domStorageEnabled
        thirdPartyCookiesEnabled
        sharedCookiesEnabled={Platform.OS === 'ios'}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        // Pull-to-refresh style — disable bounce so agent scrolls work cleanly
        bounces={false}
        scrollEnabled
      />

      {/* ── Agent activity panel — slides up from bottom ── */}
      <Animated.View
        style={[
          styles.agentPanel,
          {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            transform: [{ translateY: panelAnim }],
          },
        ]}>
        <View style={styles.agentPanelHeader}>
          <View style={[styles.agentStatusDot, { backgroundColor: statusColor }]} />
          <Text style={[styles.agentOpText, { color: colors.text }]} numberOfLines={1}>
            {agent.op || 'Agent'}
          </Text>
          {agent.status === 'running' && (
            <ActivityIndicator size="small" color={colors.accent} style={styles.agentSpinner} />
          )}
          <TouchableOpacity
            onPress={() => {
              if (panelTimeoutRef.current) clearTimeout(panelTimeoutRef.current);
              Animated.timing(panelAnim, {
                toValue: PANEL_HEIGHT, duration: 250, useNativeDriver: true,
              }).start(() => setAgent(prev => ({ ...prev, active: false })));
            }}
            hitSlop={{ top: 8, bottom: 8, left: 12, right: 12 }}>
            <Text style={[styles.dismissText, { color: colors.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>

        {agent.result ? (
          <ScrollView style={styles.agentResultScroll} showsVerticalScrollIndicator={false}>
            <Text style={[styles.agentResultText, { color: colors.textSecondary }]}>
              {agent.result}
            </Text>
          </ScrollView>
        ) : null}

        {/* Quick action row — agent shortcuts visible to user */}
        <View style={[styles.quickActions, { borderTopColor: colors.border }]}>
          {QUICK_ACTIONS.map(action => (
            <TouchableOpacity
              key={action.label}
              style={[styles.quickBtn, { backgroundColor: colors.surfaceAlt }]}
              onPress={() => action.fn(showAgentPanel)}>
              <Text style={[styles.quickBtnLabel, { color: colors.textSecondary }]}>
                {action.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>
      </Animated.View>

    </SafeAreaView>
  );
}

// Quick action definitions — user can tap these to trigger common agent ops
type ShowPanel = (op: string, status: 'running' | 'done' | 'error', result?: string) => void;

const QUICK_ACTIONS: Array<{ label: string; fn: (show: ShowPanel) => void }> = [
  {
    label: '📄 Read',
    fn: async (show) => {
      show('Extracting page content...', 'running');
      try {
        const r = await BrowserService.extract();
        show('Read page', 'done', r.markdown.slice(0, 300) + '...');
      } catch (e: any) {
        show('Read page', 'error', e.message);
      }
    },
  },
  {
    label: '⬇ Scroll',
    fn: async (show) => {
      show('Scrolling down...', 'running');
      try {
        await BrowserService.scroll('down');
        show('Scrolled down', 'done');
      } catch (e: any) {
        show('Scroll', 'error', e.message);
      }
    },
  },
  {
    label: '◀ Back',
    fn: (show) => {
      BrowserService.back();
      show('Going back', 'done');
    },
  },
  {
    label: '🔍 Search',
    fn: async (show) => {
      show('Loading page info...', 'running');
      try {
        const info = await BrowserService.getPageInfo();
        const summary = [
          `${info.title}`,
          `${info.links.length} links  •  ${info.inputs.length} inputs`,
          info.content.slice(0, 200),
        ].join('\n');
        show('Page info', 'done', summary);
      } catch (e: any) {
        show('Page info', 'error', e.message);
      }
    },
  },
];

// Sets up the ReactNativeWebView bridge before page content loads
const BRIDGE_SETUP_JS = `
  (function() {
    if (!window.ReactNativeWebView) {
      window.ReactNativeWebView = {
        postMessage: function(data) {
          window.webkit && window.webkit.messageHandlers &&
          window.webkit.messageHandlers.reactNativeWebView &&
          window.webkit.messageHandlers.reactNativeWebView.postMessage(data);
        }
      };
    }
  })();
  true;
`;

const styles = StyleSheet.create({
  container: { flex: 1 },

  // ── Address bar: compact single line ─────────────────────────────────────
  addressBar: {
    borderBottomWidth: 0.5,
    paddingHorizontal: 10,
    paddingVertical: 6,
  },
  addressRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  backBtn: {
    width: 28,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    fontSize: 24,
    fontWeight: '300',
    lineHeight: 28,
  },
  urlPill: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    borderRadius: 10,
    borderWidth: 0.5,
    paddingHorizontal: 10,
    height: 34,
    gap: 6,
  },
  loadIcon: {
    fontSize: 12,
    width: 14,
    textAlign: 'center',
  },
  urlDisplay: {
    flex: 1,
    fontSize: 13,
    fontWeight: '500',
  },
  urlEditInput: {
    flex: 1,
    fontSize: 13,
    height: 34,
    padding: 0,
  },
  progressLine: {
    height: 2,
    position: 'absolute',
    bottom: 0,
    left: 0,
  },

  // ── WebView ──────────────────────────────────────────────────────────────
  webview: { flex: 1 },

  // ── Agent panel ──────────────────────────────────────────────────────────
  agentPanel: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: PANEL_HEIGHT,
    borderTopWidth: 0.5,
    paddingTop: 10,
  },
  agentPanelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 14,
    marginBottom: 6,
    gap: 8,
  },
  agentStatusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  agentOpText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
  },
  agentSpinner: { marginLeft: 4 },
  dismissText: {
    fontSize: 14,
    fontWeight: '400',
  },
  agentResultScroll: {
    flex: 1,
    paddingHorizontal: 14,
  },
  agentResultText: {
    fontSize: 12,
    lineHeight: 17,
  },

  // ── Quick actions ─────────────────────────────────────────────────────────
  quickActions: {
    flexDirection: 'row',
    paddingHorizontal: 10,
    paddingVertical: 8,
    borderTopWidth: 0.5,
    gap: 8,
  },
  quickBtn: {
    flex: 1,
    paddingVertical: 7,
    borderRadius: 8,
    alignItems: 'center',
  },
  quickBtnLabel: {
    fontSize: 11,
    fontWeight: '600',
  },
});
