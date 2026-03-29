import React, { useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { useTheme } from '../hooks/useTheme';
import { useAgents } from '../hooks/useAgents';

export default function AgentsScreen() {
  const { colors } = useTheme();
  const { agents, activeAgent, setActiveAgent } = useAgents();

  return (
    <View style={[styles.container, { backgroundColor: colors.background }]}>
      <View style={[styles.header, { backgroundColor: colors.surface }]}>
        <Text style={[styles.title, { color: colors.text }]}>Agents</Text>
        <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
          {agents.filter(a => a.alive).length} active · {agents.filter(a => !a.alive).length} wilted
        </Text>
      </View>

      <FlatList
        data={agents}
        keyExtractor={item => item.id}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <TouchableOpacity
            onPress={() => setActiveAgent(item)}
            style={[styles.card, {
              backgroundColor: colors.surface,
              borderColor: activeAgent?.id === item.id ? colors.accent : colors.border,
              borderWidth: activeAgent?.id === item.id ? 2 : 1,
            }]}>
            <View style={styles.cardHeader}>
              <Text style={styles.emoji}>{item.emoji || '⚡'}</Text>
              <View style={styles.cardInfo}>
                <Text style={[styles.name, { color: colors.text }]}>{item.name}</Text>
                <Text style={[styles.role, { color: colors.textSecondary }]}>{item.role}</Text>
              </View>
              <View style={[styles.statusDot, {
                backgroundColor: item.alive ? colors.accentGreen : colors.textSecondary,
              }]} />
            </View>
            <View style={styles.stats}>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{item.memory.pathways}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Pathways</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{item.memory.anchors}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Anchors</Text>
              </View>
              <View style={styles.stat}>
                <Text style={[styles.statValue, { color: colors.accent }]}>{item.memory.impressions}</Text>
                <Text style={[styles.statLabel, { color: colors.textSecondary }]}>Impressions</Text>
              </View>
            </View>
          </TouchableOpacity>
        )}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyText, { color: colors.textSecondary }]}>No agents yet. Sprout your first agent in Settings.</Text>
          </View>
        }
      />

      <TouchableOpacity style={[styles.newButton, { backgroundColor: colors.accent }]}>
        <Text style={styles.newButtonText}>+ New Agent</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: { paddingTop: 60, paddingBottom: 16, paddingHorizontal: 16 },
  title: { fontSize: 24, fontWeight: '800' },
  subtitle: { fontSize: 13, marginTop: 4 },
  list: { padding: 16, paddingBottom: 100 },
  card: { borderRadius: 16, padding: 16, marginBottom: 12 },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 12 },
  emoji: { fontSize: 28 },
  cardInfo: { flex: 1 },
  name: { fontSize: 16, fontWeight: '700' },
  role: { fontSize: 12, marginTop: 2 },
  statusDot: { width: 10, height: 10, borderRadius: 5 },
  stats: { flexDirection: 'row', justifyContent: 'space-around' },
  stat: { alignItems: 'center' },
  statValue: { fontSize: 18, fontWeight: '700' },
  statLabel: { fontSize: 10, marginTop: 2 },
  empty: { padding: 40, alignItems: 'center' },
  emptyText: { fontSize: 14, textAlign: 'center' },
  newButton: {
    position: 'absolute', bottom: 100, left: 16, right: 16,
    padding: 16, borderRadius: 16, alignItems: 'center',
  },
  newButtonText: { color: '#fff', fontSize: 16, fontWeight: '700' },
});
