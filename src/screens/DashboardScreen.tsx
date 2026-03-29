import React from 'react';
import { View, Text, ScrollView, StyleSheet } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useAgents } from '../hooks/useAgents';

export default function DashboardScreen() {
  const { colors } = useTheme();
  const { agents } = useAgents();
  const activeCount = agents.filter(a => a.alive).length;

  return (
    <ScrollView style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>Command Center</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>System Overview</Text>
      </View>

      <View style={styles.grid}>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Agents</Text>
          <Text style={[styles.cardValue, { color: colors.accentGreen }]}>{activeCount}</Text>
          <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>active</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>System</Text>
          <Text style={[styles.cardValue, { color: colors.accentGreen }]}>Online</Text>
          <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>healthy</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Memory</Text>
          <Text style={[styles.cardValue, { color: colors.accent }]}>0.72</Text>
          <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>diversity</Text>
        </View>
        <View style={[styles.card, { backgroundColor: colors.surface }]}>
          <Text style={[styles.cardLabel, { color: colors.textSecondary }]}>Collapse</Text>
          <Text style={[styles.cardValue, { color: colors.accentGreen }]}>Safe</Text>
          <Text style={[styles.cardDetail, { color: colors.textSecondary }]}>no risk</Text>
        </View>
      </View>

      <View style={[styles.section, { backgroundColor: colors.surface }]}>
        <Text style={[styles.sectionTitle, { color: colors.text }]}>Transpiration</Text>
        {agents.filter(a => a.alive).map(agent => (
          <View key={agent.id} style={styles.transpRow}>
            <Text style={[styles.transpName, { color: colors.text }]}>{agent.emoji} {agent.name}</Text>
            <View style={[styles.transpBar, { backgroundColor: colors.border }]}>
              <View style={[styles.transpFill, { backgroundColor: colors.accentGreen, width: '85%' }]} />
            </View>
            <Text style={[styles.transpStatus, { color: colors.accentGreen }]}>✓</Text>
          </View>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', padding: 8 },
  card: {
    width: '46%', margin: '2%', borderRadius: 16, padding: 16, alignItems: 'center',
  },
  cardLabel: { fontSize: 11, fontWeight: '600', marginBottom: 4 },
  cardValue: { fontSize: 24, fontWeight: '800' },
  cardDetail: { fontSize: 10, marginTop: 2 },
  section: { margin: 16, borderRadius: 16, padding: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '700', marginBottom: 12 },
  transpRow: { flexDirection: 'row', alignItems: 'center', marginBottom: 8, gap: 8 },
  transpName: { fontSize: 13, width: 100 },
  transpBar: { flex: 1, height: 6, borderRadius: 3, overflow: 'hidden' },
  transpFill: { height: '100%', borderRadius: 3 },
  transpStatus: { fontSize: 14 },
});
