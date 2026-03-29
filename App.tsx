import React, { useEffect, useState } from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StatusBar, ActivityIndicator, View, StyleSheet, Text, AppState } from 'react-native';
import ChatScreen from './src/screens/ChatScreen';
import AgentsScreen from './src/screens/AgentsScreen';
import DashboardScreen from './src/screens/DashboardScreen';
import CricketsScreen from './src/screens/CricketsScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import SetupScreen from './src/screens/SetupScreen';
import BrowserScreen from './src/screens/BrowserScreen';
import { AgentProvider, useAgents } from './src/hooks/useAgents';
import { ThemeProvider, useTheme } from './src/hooks/useTheme';
import { bootstrap, shutdown, BootStatus } from './src/services/AppBootstrap';

const Tab = createBottomTabNavigator();

function AppContent() {
  const { isSetupComplete, isLoading } = useAgents();
  const { colors } = useTheme();
  const [bootStatus, setBootStatus] = useState<BootStatus | null>(null);
  const [booted, setBooted] = useState(false);

  // Bootstrap the cognitive engine after setup is complete
  useEffect(() => {
    if (isSetupComplete && !booted) {
      bootstrap((status) => setBootStatus(status)).then((ok) => {
        setBooted(true);
        if (!ok) console.warn('[app] Bootstrap incomplete — running in limited mode');
      });
    }
  }, [isSetupComplete, booted]);

  // Handle app state changes — save on background, restore on foreground
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'background' || state === 'inactive') {
        shutdown().catch(console.error);
      }
    });
    return () => sub.remove();
  }, []);

  if (isLoading) {
    return (
      <View style={[styles.loading, { backgroundColor: colors.background }]}>
        <ActivityIndicator size="large" color={colors.accent} />
        {bootStatus && (
          <Text style={[styles.bootText, { color: colors.textSecondary }]}>
            {bootStatus.phase}
          </Text>
        )}
      </View>
    );
  }

  if (!isSetupComplete) {
    return <SetupScreen />;
  }

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.border,
          borderTopWidth: 0.5,
          paddingBottom: 20,
          paddingTop: 8,
          height: 80,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textSecondary,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '600' },
      }}>
      <Tab.Screen
        name="Chat"
        component={ChatScreen}
        options={{ tabBarLabel: 'Chat', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Agents"
        component={AgentsScreen}
        options={{ tabBarLabel: 'Agents', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Dashboard"
        component={DashboardScreen}
        options={{ tabBarLabel: 'Dashboard', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Crickets"
        component={CricketsScreen}
        options={{ tabBarLabel: 'Crickets', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Browser"
        component={BrowserScreen}
        options={{ tabBarLabel: 'Browser', tabBarIcon: () => null }}
      />
      <Tab.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ tabBarLabel: 'Settings', tabBarIcon: () => null }}
      />
    </Tab.Navigator>
  );
}

export default function App() {
  return (
    <ThemeProvider>
      <AgentProvider>
        <NavigationContainer>
          <StatusBar barStyle="light-content" />
          <AppContent />
        </NavigationContainer>
      </AgentProvider>
    </ThemeProvider>
  );
}

const styles = StyleSheet.create({
  loading: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  bootText: {
    marginTop: 16,
    fontSize: 13,
  },
});
