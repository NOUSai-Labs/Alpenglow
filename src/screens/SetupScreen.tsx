import React, { useState } from 'react';
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useTheme } from '../hooks/useTheme';
import { useAgents } from '../hooks/useAgents';
import PairScreen from './PairScreen';
import type { PairingPayload } from '../services/PairingService';

type Step = 'welcome' | 'pairing' | 'account' | 'provider' | 'agent';

const PROVIDERS = [
  { id: 'openrouter', name: 'OpenRouter', emoji: '🔀', color: '#8b5cf6', placeholder: 'sk-or-...', desc: '300+ models, one key', recommended: true },
  { id: 'openai', name: 'OpenAI', emoji: '⬡', color: '#10a37f', placeholder: 'sk-...', desc: 'GPT-5, o3' },
  { id: 'anthropic', name: 'Anthropic', emoji: '◈', color: '#d97706', placeholder: 'sk-ant-...', desc: 'Claude Opus, Sonnet' },
  { id: 'google', name: 'Google AI', emoji: '◆', color: '#4285f4', placeholder: 'AIza...', desc: 'Gemini 2.5' },
  { id: 'ollama', name: 'Ollama (Local)', emoji: '🦙', color: '#888', placeholder: 'http://localhost:11434', desc: 'Free, runs on your hardware' },
];

export default function SetupScreen() {
  const { colors } = useTheme();
  const { completeSetup } = useAgents();
  const [step, setStep] = useState<Step>('welcome');
  const [name, setName] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [agentName, setAgentName] = useState('');

  async function handleComplete() {
    await completeSetup({
      ownerName: name,
      apiKeys: { [selectedProvider]: apiKey },
    });
  }

  async function handlePairingComplete(payload: PairingPayload) {
    // Save agents with psyche data BEFORE completing setup
    if (payload.agents?.length > 0) {
      const agentList = payload.agents.map((a: any) => ({
        id: a.id,
        name: a.name,
        role: a.role,
        emoji: a.emoji || '⚡',
        alive: true,
        memory: { pathways: 0, anchors: 0, impressions: 0 },
        department: a.department || 'Engineering',
        model: a.model || 'openai/gpt-4.1-mini',
        psyche: a.psyche || null,
      }));
      await AsyncStorage.setItem('alpenglow_agents', JSON.stringify(agentList));
    }

    // Paired device inherits account + agents + psyche from desktop
    await completeSetup({
      ownerName: payload.ownerName,
      apiKeys: payload.apiKeys,
      desktopUrl: payload.desktopUrl,
      licenseKey: payload.licenseKey,
    });
  }

  if (step === 'pairing') {
    return (
      <PairScreen
        onComplete={handlePairingComplete}
        onCancel={() => setStep('welcome')}
      />
    );
  }

  if (step === 'welcome') {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}
        contentContainerStyle={styles.centered}>
        <Text style={styles.mountainEmoji}>🌄</Text>
        <Text style={[styles.welcomeTitle, { color: colors.text }]}>Welcome to Alpenglow</Text>
        <Text style={[styles.welcomeBody, { color: colors.textSecondary }]}>
          Your personal AI agent platform. Agents live on YOUR device — your conversations, memories, and data never leave your hands.
        </Text>

        {/* Primary: new account */}
        <TouchableOpacity
          onPress={() => setStep('account')}
          style={[styles.primaryButton, { backgroundColor: colors.accent }]}>
          <Text style={styles.buttonText}>🆕  Create New Account</Text>
        </TouchableOpacity>

        {/* Secondary: pair with existing desktop */}
        <TouchableOpacity
          onPress={() => setStep('pairing')}
          style={[styles.pairButton, {
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }]}>
          <View style={styles.pairButtonContent}>
            <Text style={styles.pairButtonIcon}>💻</Text>
            <View style={{ flex: 1 }}>
              <Text style={[styles.pairButtonTitle, { color: colors.text }]}>
                Pair with Desktop
              </Text>
              <Text style={[styles.pairButtonDesc, { color: colors.textSecondary }]}>
                Already have Alpenglow on your computer? Connect this phone to your existing account — everything syncs automatically.
              </Text>
            </View>
          </View>
        </TouchableOpacity>

        <Text style={[styles.legalNote, { color: colors.textSecondary }]}>
          We collect anonymized system health metrics only. Never your conversations or files.
        </Text>
      </ScrollView>
    );
  }

  if (step === 'account') {
    return (
      <KeyboardAvoidingView style={[styles.container, { backgroundColor: colors.background }]}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}>
        <ScrollView contentContainerStyle={styles.centered}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>What's your name?</Text>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder="Your name"
            placeholderTextColor={colors.textSecondary}
            style={[styles.input, { color: colors.text, backgroundColor: colors.surface, borderColor: colors.border }]}
            autoFocus
          />
          <TouchableOpacity
            onPress={() => setStep('provider')}
            disabled={!name.trim()}
            style={[styles.primaryButton, {
              backgroundColor: name.trim() ? colors.accent : colors.border,
            }]}>
            <Text style={styles.buttonText}>Next</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
    );
  }

  if (step === 'provider') {
    return (
      <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.providerContent}>
          <Text style={[styles.stepTitle, { color: colors.text }]}>Choose an AI Provider</Text>
          <TouchableOpacity onPress={() => Linking.openURL('https://openrouter.ai/')}>
            <Text style={[styles.hint, { color: colors.accent }]}>
              Don't have an API key? Sign up at OpenRouter →
            </Text>
          </TouchableOpacity>

          {PROVIDERS.map(p => (
            <TouchableOpacity
              key={p.id}
              onPress={() => setSelectedProvider(p.id)}
              style={[styles.providerCard, {
                backgroundColor: colors.surface,
                borderColor: selectedProvider === p.id ? p.color : colors.border,
                borderWidth: selectedProvider === p.id ? 2 : 1,
              }]}>
              <View style={styles.providerHeader}>
                <Text style={styles.providerEmoji}>{p.emoji}</Text>
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <Text style={[styles.providerName, { color: colors.text }]}>{p.name}</Text>
                    {p.recommended && (
                      <View style={[styles.badge, { backgroundColor: `${p.color}20`, borderColor: `${p.color}40` }]}>
                        <Text style={[styles.badgeText, { color: p.color }]}>RECOMMENDED</Text>
                      </View>
                    )}
                  </View>
                  <Text style={[styles.providerDesc, { color: colors.textSecondary }]}>{p.desc}</Text>
                </View>
              </View>
              {selectedProvider === p.id && (
                <TextInput
                  value={apiKey}
                  onChangeText={setApiKey}
                  placeholder={p.placeholder}
                  placeholderTextColor={colors.textSecondary}
                  style={[styles.keyInput, { color: colors.text, backgroundColor: colors.surfaceAlt, borderColor: colors.border }]}
                  autoFocus
                  secureTextEntry
                />
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            onPress={handleComplete}
            disabled={!selectedProvider || !apiKey.trim()}
            style={[styles.primaryButton, {
              backgroundColor: selectedProvider && apiKey.trim() ? colors.accent : colors.border,
              marginTop: 20,
            }]}>
            <Text style={styles.buttonText}>Launch Alpenglow</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
    );
  }

  return null;
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  centered: { padding: 24, paddingTop: 120, alignItems: 'center' },
  mountainEmoji: { fontSize: 60, marginBottom: 20 },
  welcomeTitle: { fontSize: 28, fontWeight: '800', marginBottom: 20, textAlign: 'center' },
  welcomeBody: { fontSize: 14, lineHeight: 22, textAlign: 'center', marginBottom: 40 },
  stepTitle: { fontSize: 24, fontWeight: '700', marginBottom: 20, textAlign: 'center' },
  hint: { fontSize: 13, marginBottom: 20, textAlign: 'center' },
  input: {
    width: '100%', borderRadius: 16, padding: 16, fontSize: 16,
    borderWidth: 1, marginBottom: 20,
  },
  primaryButton: { width: '100%', padding: 18, borderRadius: 16, alignItems: 'center', marginBottom: 12 },
  buttonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  pairButton: {
    width: '100%', borderRadius: 16, borderWidth: 1,
    padding: 16, marginBottom: 24,
  },
  pairButtonContent: { flexDirection: 'row', alignItems: 'flex-start', gap: 14 },
  pairButtonIcon: { fontSize: 28, marginTop: 2 },
  pairButtonTitle: { fontSize: 15, fontWeight: '700', marginBottom: 4 },
  pairButtonDesc: { fontSize: 12, lineHeight: 18 },
  legalNote: { fontSize: 11, textAlign: 'center', lineHeight: 17, paddingHorizontal: 20 },
  providerContent: { padding: 24, paddingTop: 80 },
  providerCard: { borderRadius: 16, padding: 16, marginBottom: 10 },
  providerHeader: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  providerEmoji: { fontSize: 24 },
  providerName: { fontSize: 15, fontWeight: '700' },
  providerDesc: { fontSize: 11, marginTop: 2 },
  badge: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8, borderWidth: 1 },
  badgeText: { fontSize: 8, fontWeight: '800' },
  keyInput: {
    marginTop: 12, borderRadius: 12, padding: 12, fontSize: 13,
    borderWidth: 1, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
});
