import React, { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, FlatList, TouchableOpacity,
  KeyboardAvoidingView, Platform, StyleSheet, ActivityIndicator,
} from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useAgents } from '../hooks/useAgents';
import { showFloatingChat } from '../components/FloatingChat';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export default function ChatScreen() {
  const { colors } = useTheme();
  const { activeAgent, sendMessage, desktopConnected } = useAgents();
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const flatListRef = useRef<FlatList>(null);

  async function handleSend() {
    if (!input.trim() || isLoading) return;

    const userMsg: Message = {
      id: `msg_${Date.now()}_user`,
      role: 'user',
      content: input.trim(),
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await sendMessage(userMsg.content);
      const agentMsg: Message = {
        id: `msg_${Date.now()}_agent`,
        role: 'assistant',
        content: response,
        timestamp: Date.now(),
      };
      setMessages(prev => [...prev, agentMsg]);
    } catch (err: any) {
      setMessages(prev => [...prev, {
        id: `msg_${Date.now()}_error`,
        role: 'assistant',
        content: `Error: ${err.message}`,
        timestamp: Date.now(),
      }]);
    } finally {
      setIsLoading(false);
    }
  }

  const renderMessage = ({ item }: { item: Message }) => (
    <View style={[
      styles.bubble,
      item.role === 'user'
        ? [styles.userBubble, { backgroundColor: colors.userBubble }]
        : [styles.agentBubble, { backgroundColor: colors.agentBubble }],
    ]}>
      {item.role === 'assistant' && activeAgent && (
        <Text style={[styles.agentName, { color: colors.accent }]}>
          {activeAgent.emoji || '⚡'} {activeAgent.name}
        </Text>
      )}
      <Text style={[styles.messageText, { color: colors.text }]}>
        {item.content}
      </Text>
    </View>
  );

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.background }]}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      keyboardVerticalOffset={90}>

      {/* Header */}
      <View style={[styles.header, { backgroundColor: colors.surface, borderBottomColor: colors.border }]}>
        <Text style={[styles.headerTitle, { color: colors.text }]}>
          {activeAgent ? `${activeAgent.emoji || '⚡'} ${activeAgent.name}` : 'Alpenglow'}
        </Text>
        {activeAgent && (
          <View style={styles.headerRow}>
            <Text style={[styles.headerSubtitle, { color: colors.textSecondary }]}>
              {activeAgent.role} • Online{desktopConnected ? ' • 💻 Desktop' : ''}
            </Text>
            <TouchableOpacity onPress={showFloatingChat} style={styles.floatBtn}>
              <Text style={[styles.floatBtnText, { color: colors.accent }]}>💬 Float</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {/* Messages */}
      <FlatList
        ref={flatListRef}
        data={messages}
        renderItem={renderMessage}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.messageList}
        onContentSizeChange={() => flatListRef.current?.scrollToEnd()}
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text style={[styles.emptyTitle, { color: colors.textSecondary }]}>
              {activeAgent ? `Chat with ${activeAgent.name}` : 'No agent selected'}
            </Text>
            <Text style={[styles.emptySubtitle, { color: colors.textSecondary }]}>
              Your conversation is stored locally and encrypted.
            </Text>
          </View>
        }
      />

      {/* Loading indicator */}
      {isLoading && (
        <View style={styles.loadingRow}>
          <ActivityIndicator size="small" color={colors.accent} />
          <Text style={[styles.loadingText, { color: colors.textSecondary }]}>
            {activeAgent?.name} is thinking...
          </Text>
        </View>
      )}

      {/* Input bar */}
      <View style={[styles.inputBar, { backgroundColor: colors.surface, borderTopColor: colors.border }]}>
        <TextInput
          value={input}
          onChangeText={setInput}
          placeholder={`Message ${activeAgent?.name || 'your agent'}...`}
          placeholderTextColor={colors.textSecondary}
          style={[styles.input, { color: colors.text, backgroundColor: colors.surfaceAlt }]}
          multiline
          maxLength={10000}
          returnKeyType="send"
          onSubmitEditing={handleSend}
          blurOnSubmit={false}
        />
        <TouchableOpacity
          onPress={handleSend}
          disabled={!input.trim() || isLoading}
          style={[styles.sendButton, {
            backgroundColor: input.trim() ? colors.accent : colors.border,
          }]}>
          <Text style={styles.sendButtonText}>↑</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingTop: 60,
    paddingBottom: 12,
    paddingHorizontal: 16,
    borderBottomWidth: 0.5,
  },
  headerTitle: { fontSize: 18, fontWeight: '700' },
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 },
  headerSubtitle: { fontSize: 12 },
  floatBtn: { paddingHorizontal: 8, paddingVertical: 2 },
  floatBtnText: { fontSize: 12, fontWeight: '600' },
  messageList: { padding: 16, paddingBottom: 8 },
  bubble: {
    maxWidth: '80%',
    padding: 12,
    borderRadius: 16,
    marginBottom: 8,
  },
  userBubble: { alignSelf: 'flex-end', borderBottomRightRadius: 4 },
  agentBubble: { alignSelf: 'flex-start', borderBottomLeftRadius: 4 },
  agentName: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  messageText: { fontSize: 15, lineHeight: 21 },
  emptyState: { flex: 1, justifyContent: 'center', alignItems: 'center', paddingTop: 200 },
  emptyTitle: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
  emptySubtitle: { fontSize: 13, textAlign: 'center', paddingHorizontal: 40 },
  loadingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    gap: 8,
  },
  loadingText: { fontSize: 13 },
  inputBar: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 30,
    borderTopWidth: 0.5,
    alignItems: 'flex-end',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 20,
    paddingHorizontal: 16,
    paddingVertical: 10,
    fontSize: 15,
    maxHeight: 120,
  },
  sendButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
