/**
 * FloatingChat — Condensed in-app chat overlay.
 *
 * A draggable, collapsible chat bubble that floats over all tabs.
 * Collapse: small ⚡ bubble showing last message preview
 * Expand: compact chat with 4-5 messages + input field
 *
 * Lives at the App.tsx level, above the tab navigator.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, FlatList,
  StyleSheet, Animated, PanResponder, Dimensions, Keyboard,
  NativeModules, Platform,
} from 'react-native';
import { useAgents } from '../hooks/useAgents';
import { useTheme } from '../hooks/useTheme';

const { width: SCREEN_W, height: SCREEN_H } = Dimensions.get('window');
const BUBBLE_SIZE = 52;
const EXPANDED_W = SCREEN_W - 32;
const EXPANDED_H = 340;
const SNAP_MARGIN = 8;

interface MiniMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

const { PiPChatBridge } = NativeModules;

export default function FloatingChat() {
  const { activeAgent, sendMessage, desktopConnected } = useAgents();
  const { colors } = useTheme();

  const [expanded, setExpanded] = useState(false);
  const [messages, setMessages] = useState<MiniMessage[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [visible, setVisible] = useState(true);
  const [isPiP, setIsPiP] = useState(false);

  // Register global show callback so other components can reopen us
  useEffect(() => {
    registerShowFloatingChat(() => {
      setVisible(true);
      _isVisible = true;
    });
  }, []);

  const pan = useRef(new Animated.ValueXY({ x: SCREEN_W - BUBBLE_SIZE - SNAP_MARGIN, y: SCREEN_H - 200 })).current;
  const flatListRef = useRef<FlatList>(null);

  // Keep PiP messages in sync
  useEffect(() => {
    if (isPiP && PiPChatBridge) {
      const pipMsgs = messages.slice(-5).map(m => ({ role: m.role, text: m.content }));
      PiPChatBridge.updateMessages(pipMsgs).catch(() => {});
    }
  }, [messages, isPiP]);

  // Drag gesture
  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => !expanded,
      onMoveShouldSetPanResponder: (_, gs) =>
        !expanded && (Math.abs(gs.dx) > 5 || Math.abs(gs.dy) > 5),
      onPanResponderGrant: () => {
        pan.setOffset({ x: (pan.x as any)._value, y: (pan.y as any)._value });
        pan.setValue({ x: 0, y: 0 });
      },
      onPanResponderMove: Animated.event([null, { dx: pan.x, dy: pan.y }], { useNativeDriver: false }),
      onPanResponderRelease: (_, gs) => {
        pan.flattenOffset();
        // Snap to nearest edge
        const curX = (pan.x as any)._value;
        const snapX = curX < SCREEN_W / 2
          ? SNAP_MARGIN
          : SCREEN_W - BUBBLE_SIZE - SNAP_MARGIN;
        Animated.spring(pan.x, { toValue: snapX, useNativeDriver: false, friction: 8 }).start();

        // Clamp Y
        const curY = (pan.y as any)._value;
        const clampedY = Math.max(60, Math.min(curY, SCREEN_H - 120));
        if (curY !== clampedY) {
          Animated.spring(pan.y, { toValue: clampedY, useNativeDriver: false }).start();
        }
      },
    })
  ).current;

  const handleSend = useCallback(async () => {
    if (!input.trim() || isLoading) return;

    const userMsg: MiniMessage = {
      id: `mini_${Date.now()}_u`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);
    Keyboard.dismiss();

    try {
      const response = await sendMessage(userMsg.content);
      setMessages(prev => [...prev, {
        id: `mini_${Date.now()}_a`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      }]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `mini_${Date.now()}_e`,
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }, [input, isLoading, sendMessage]);

  const toggleExpand = useCallback(() => {
    if (!expanded) {
      // Expand — position at bottom center
      Animated.parallel([
        Animated.spring(pan.x, { toValue: 16, useNativeDriver: false, friction: 8 }),
        Animated.spring(pan.y, { toValue: SCREEN_H - EXPANDED_H - 120, useNativeDriver: false, friction: 8 }),
      ]).start();
    }
    setExpanded(!expanded);
  }, [expanded, pan]);

  const handlePiP = useCallback(async () => {
    if (!PiPChatBridge) return;
    try {
      if (isPiP) {
        await PiPChatBridge.stopPiP();
        setIsPiP(false);
      } else {
        if (activeAgent) {
          await PiPChatBridge.setAgent(activeAgent.name, activeAgent.emoji || '⚡');
        }
        const pipMsgs = messages.slice(-5).map(m => ({ role: m.role, text: m.content }));
        await PiPChatBridge.updateMessages(pipMsgs);
        await PiPChatBridge.startPiP();
        setIsPiP(true);
      }
    } catch (err) {
      console.warn('[FloatingChat] PiP error:', err);
    }
  }, [isPiP, messages, activeAgent]);

  const handleClose = useCallback(() => {
    setVisible(false);
    setExpanded(false);
    _isVisible = false;
  }, []);

  if (!visible || !activeAgent) return null;

  const lastMessage = messages[messages.length - 1];

  // ── Collapsed bubble ──
  if (!expanded) {
    return (
      <Animated.View
        style={[styles.bubble, { transform: pan.getTranslateTransform(), backgroundColor: colors.accent }]}
        {...panResponder.panHandlers}
      >
        <TouchableOpacity onPress={toggleExpand} activeOpacity={0.8} style={styles.bubbleTouch}>
          <Text style={styles.bubbleEmoji}>{activeAgent.emoji || '⚡'}</Text>
          {isLoading && <View style={styles.loadingDot} />}
        </TouchableOpacity>
      </Animated.View>
    );
  }

  // ── Expanded mini-chat ──
  return (
    <Animated.View
      style={[
        styles.expanded,
        {
          transform: pan.getTranslateTransform(),
          backgroundColor: colors.surface,
          borderColor: colors.border,
        },
      ]}
    >
      {/* Header */}
      <View style={[styles.header, { borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={toggleExpand} style={styles.headerLeft}>
          <Text style={styles.headerEmoji}>{activeAgent.emoji || '⚡'}</Text>
          <View>
            <Text style={[styles.headerName, { color: colors.text }]}>{activeAgent.name}</Text>
            <Text style={[styles.headerStatus, { color: colors.textSecondary }]}>
              {isLoading ? 'Thinking...' : 'Online'}{desktopConnected ? ' • 💻' : ''}
            </Text>
          </View>
        </TouchableOpacity>
        <View style={styles.headerActions}>
          {Platform.OS === 'ios' && PiPChatBridge && (
            <TouchableOpacity onPress={handlePiP} style={styles.headerBtn}>
              <Text style={[styles.headerBtnText, { color: colors.accent }]}>
                {isPiP ? '⬇️' : '📺'}
              </Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity onPress={toggleExpand} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: colors.textSecondary }]}>▼</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={handleClose} style={styles.headerBtn}>
            <Text style={[styles.headerBtnText, { color: colors.textSecondary }]}>✕</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        renderItem={({ item }) => (
          <View style={[
            styles.msgBubble,
            item.role === 'user'
              ? [styles.msgUser, { backgroundColor: colors.accent + '33' }]
              : [styles.msgAgent, { backgroundColor: colors.surfaceAlt || colors.border + '44' }],
          ]}>
            <Text style={[styles.msgText, { color: colors.text }]} numberOfLines={4}>
              {item.content}
            </Text>
          </View>
        )}
        ListEmptyComponent={
          <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
            Quick chat with {activeAgent.name}
          </Text>
        }
      />

      {/* Input */}
      <View style={[styles.inputRow, { borderTopColor: colors.border }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder="Quick message..."
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, backgroundColor: colors.background }]}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
          editable={!isLoading}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!input.trim() || isLoading}
          style={[styles.sendBtn, { backgroundColor: input.trim() ? colors.accent : colors.border }]}
        >
          <Text style={styles.sendBtnText}>↑</Text>
        </TouchableOpacity>
      </View>
    </Animated.View>
  );
}

// ── Global show/hide control ──
let _showFloatingChat: (() => void) | null = null;
export function showFloatingChat() { _showFloatingChat?.(); }
export function registerShowFloatingChat(fn: () => void) { _showFloatingChat = fn; }
export function isFloatingChatVisible() { return _isVisible; }
let _isVisible = true;

const styles = StyleSheet.create({
  // Collapsed bubble
  bubble: {
    position: 'absolute',
    width: BUBBLE_SIZE,
    height: BUBBLE_SIZE,
    borderRadius: BUBBLE_SIZE / 2,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  bubbleTouch: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bubbleEmoji: { fontSize: 24 },
  loadingDot: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: '#00ff88',
  },

  // Expanded
  expanded: {
    position: 'absolute',
    width: EXPANDED_W,
    height: EXPANDED_H,
    borderRadius: 16,
    borderWidth: 0.5,
    zIndex: 9999,
    elevation: 10,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    overflow: 'hidden',
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 0.5,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  headerEmoji: { fontSize: 20 },
  headerName: { fontSize: 14, fontWeight: '700' },
  headerStatus: { fontSize: 10, marginTop: 1 },
  headerActions: { flexDirection: 'row', gap: 4 },
  headerBtn: { padding: 6 },
  headerBtnText: { fontSize: 14 },

  // Messages
  messageList: { padding: 8, paddingBottom: 4 },
  msgBubble: {
    maxWidth: '85%',
    padding: 8,
    borderRadius: 12,
    marginBottom: 4,
  },
  msgUser: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  msgAgent: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  msgText: { fontSize: 13, lineHeight: 18 },
  emptyText: { textAlign: 'center', marginTop: 40, fontSize: 13 },

  // Input
  inputRow: {
    flexDirection: 'row',
    padding: 8,
    borderTopWidth: 0.5,
    alignItems: 'flex-end',
    gap: 6,
  },
  input: {
    flex: 1,
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    fontSize: 13,
    maxHeight: 60,
  },
  sendBtn: {
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendBtnText: { color: '#fff', fontSize: 14, fontWeight: '700' },
});
