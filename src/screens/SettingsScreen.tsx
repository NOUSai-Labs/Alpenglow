import React, { useState } from 'react';
import { View, Text, ScrollView, TextInput, TouchableOpacity, StyleSheet, Linking } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useAgents } from '../hooks/useAgents';

export default function SettingsScreen() {
  const { colors } = useTheme();
  const { settings } = useAgents();
  const [showKey, setShowKey] = useState(false);

  const providers = Object.keys(settings.apiKeys);
  const hasKey = providers.length > 0;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>Settings</Text>
      </View>

      {/* Account */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Account</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Name</Text>
          <Text style={[styles.value, { color: colors.text }]}>{settings.ownerName}</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Tier</Text>
          <Text style={[styles.value, { color: colors.accentGreen }]}>Beta (Plus)</Text>
        </View>
      </View>

      {/* API Keys */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>API Providers</Text>
        {hasKey ? (
          providers.map(p => (
            <View key={p} style={styles.row}>
              <Text style={[styles.label, { color: colors.textSecondary }]}>{p}</Text>
              <Text style={[styles.value, { color: colors.accentGreen }]}>✓ Connected</Text>
            </View>
          ))
        ) : (
          <TouchableOpacity onPress={() => Linking.openURL('https://openrouter.ai/')}>
            <Text style={[styles.linkText, { color: colors.accent }]}>
              Add an API key to get started →
            </Text>
          </TouchableOpacity>
        )}
      </View>

      {/* Sync */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Sync</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Cloud</Text>
          <Text style={[styles.value, { color: colors.accentGreen }]}>Connected</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Last sync</Text>
          <Text style={[styles.value, { color: colors.text }]}>Just now</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Desktop</Text>
          <Text style={[styles.value, { color: colors.textSecondary }]}>Not paired</Text>
        </View>
      </View>

      {/* About */}
      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>About</Text>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Version</Text>
          <Text style={[styles.value, { color: colors.text }]}>0.1.0-beta</Text>
        </View>
        <View style={styles.row}>
          <Text style={[styles.label, { color: colors.textSecondary }]}>Platform</Text>
          <Text style={[styles.value, { color: colors.text }]}>Alpenglow by NOUS AI Labs</Text>
        </View>
      </View>

      {/* Privacy note */}
      <View style={styles.privacy}>
        <Text style={[styles.privacyText, { color: colors.textSecondary }]}>
          Your data never leaves your device. Memory is encrypted with a device-bound key.
          We cannot see your conversations, files, or agent data.
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  section: { margin: 16, marginBottom: 0, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 },
  label: { fontSize: 14 },
  value: { fontSize: 14, fontWeight: '600' },
  linkText: { fontSize: 14, fontWeight: '600', paddingVertical: 8 },
  privacy: { padding: 24 },
  privacyText: { fontSize: 12, textAlign: 'center', lineHeight: 18 },
});
