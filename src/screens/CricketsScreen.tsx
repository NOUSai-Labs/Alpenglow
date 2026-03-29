import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';

export default function CricketsScreen() {
  const { colors } = useTheme();

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>🦗 Crickets</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          Scheduled tasks that chirp on time
        </Text>
      </View>

      <View style={styles.stats}>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statValue, { color: colors.accent }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Active</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statValue, { color: colors.accentAmber }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Paused</Text>
        </View>
        <View style={[styles.statCard, { backgroundColor: colors.surface }]}>
          <Text style={[styles.statValue, { color: colors.accentGreen }]}>0</Text>
          <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Chirps</Text>
        </View>
      </View>

      <View style={styles.empty}>
        <Text style={{ fontSize: 40 }}>🦗</Text>
        <Text style={[styles.emptyText, { color: colors.textSecondary }]}>
          No crickets yet. Ask your agent to schedule a recurring task.
        </Text>
      </View>

      <View style={[styles.spiderStatus, { backgroundColor: colors.surface }]}>
        <Text style={[styles.spiderText, { color: colors.textSecondary }]}>
          🕷️ Spider: watching
        </Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4 },
  stats: { flexDirection: 'row', padding: 16, gap: 8 },
  statCard: { flex: 1, borderRadius: 12, padding: 16, alignItems: 'center' },
  statValue: { fontSize: 24, fontWeight: '800' },
  statLabel: { fontSize: 10, marginTop: 4 },
  empty: { alignItems: 'center', padding: 60 },
  emptyText: { fontSize: 14, textAlign: 'center', marginTop: 12 },
  spiderStatus: { margin: 16, borderRadius: 12, padding: 12, alignItems: 'center' },
  spiderText: { fontSize: 12 },
});
