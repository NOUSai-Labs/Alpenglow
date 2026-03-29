import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { memoryService } from '../services/MemoryService';
import { deviceManager } from '../services/DeviceManager';
import { desktopBridge, type PsycheCore } from '../services/DesktopBridge';
import { executeMobileTool, getMobileToolDefinitions } from '../tools';
import { syncService } from '../services/SyncService';

// ── Types ─────────────────────────────────────────────────────────────────

interface Agent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  alive: boolean;
  memory: { pathways: number; anchors: number; impressions: number };
  department?: string;
  model: string;
  psyche?: PsycheCore;
}

interface Settings {
  setupComplete: boolean;
  ownerName: string;
  apiKeys: Record<string, string>;
  cloudUrl: string;
  licenseKey?: string;
  desktopUrl?: string;
}

interface AgentContextType {
  agents: Agent[];
  activeAgent: Agent | null;
  settings: Settings;
  isSetupComplete: boolean;
  isLoading: boolean;
  desktopConnected: boolean;
  setActiveAgent: (agent: Agent) => void;
  sendMessage: (message: string) => Promise<string>;
  completeSetup: (settings: Partial<Settings>) => Promise<void>;
  refreshAgents: () => Promise<void>;
}

const defaultSettings: Settings = {
  setupComplete: false,
  ownerName: '',
  apiKeys: {},
  cloudUrl: 'https://alpenglow.onrender.com',
};

// ── Desktop tool definitions (routed to desktop when connected) ───────────

const DESKTOP_TOOLS = [
  {
    type: 'function' as const,
    function: {
      name: 'shell',
      description: 'Execute a shell command on the desktop computer. Use for opening apps, running scripts, file operations, system commands.',
      parameters: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'The shell command to execute' },
        },
        required: ['command'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'desktop_file',
      description: 'Read, write, or list files on the desktop computer.',
      parameters: {
        type: 'object',
        properties: {
          operation: { type: 'string', enum: ['read', 'write', 'list', 'search'], description: 'File operation' },
          path: { type: 'string', description: 'File or directory path' },
          content: { type: 'string', description: 'Content to write (for write operation)' },
          query: { type: 'string', description: 'Search query (for search operation)' },
        },
        required: ['operation', 'path'],
      },
    },
  },
];

// Tools that run on phone vs desktop
const PHONE_TOOL_NAMES = new Set([
  'calendar', 'contacts', 'messages', 'homekit', 'health',
  'media', 'location', 'shortcuts', 'reminders', 'photos',
  'browser', 'spotify',
]);
const DESKTOP_TOOL_NAMES = new Set(['shell', 'desktop_file']);

// ── Psyche Prompt Generator (matches desktop generatePsychePrompt) ────────

function generatePsychePrompt(psyche: PsycheCore, ownerName: string): string {
  const parts: string[] = [];

  parts.push(`# You are ${psyche.name}`);
  if (psyche.role) parts.push(psyche.role);
  if (psyche.vibe) parts.push(`*${psyche.vibe}*`);

  if (psyche.personality.length > 0) {
    parts.push('', '## How you operate');
    for (const trait of psyche.personality) parts.push(`- ${trait}`);
  }

  if (psyche.beliefs.length > 0) {
    parts.push('', '## Core beliefs');
    for (const belief of psyche.beliefs) parts.push(`- ${belief}`);
  }

  if (psyche.boundaries.length > 0) {
    parts.push('', '## Rules');
    for (const rule of psyche.boundaries) parts.push(`- ${rule}`);
  }

  if (psyche.owner || psyche.team.length > 0) {
    parts.push('');
    if (psyche.owner) parts.push(`Reports to: ${psyche.owner}`);
    if (psyche.team.length > 0) {
      parts.push(`Team: ${psyche.team.map(t => `${t.name} (${t.role})`).join(', ')}`);
    }
  }

  // Mobile-specific context
  parts.push('', '## Current context');
  parts.push(`- You are running on ${ownerName}'s phone (Alpenglow Mobile)`);
  parts.push('- You have access to phone capabilities: calendar, contacts, messages, health, location, photos, browser, Spotify, HomeKit, Siri shortcuts');
  if (desktopBridge.isConnected) {
    parts.push('- The desktop computer is CONNECTED — you can execute shell commands and access the filesystem');
  } else {
    parts.push('- The desktop computer is currently OFFLINE — phone-only tools available');
  }
  parts.push('- Your memory persists across conversations and syncs between devices');

  return parts.join('\n');
}

/** Fallback psyche when no desktop pairing exists */
function defaultPsychePrompt(agentName: string, agentRole: string, ownerName: string): string {
  return `# You are ${agentName}
${agentRole}
*Direct, no-nonsense, code speaks louder than words*

## How you operate
- Never lie. If you don't know, say so.
- Be competent. Prove it every day.
- Act immediately on tasks. Do it NOW.

## Current context
- You are running on ${ownerName}'s phone (Alpenglow Mobile)
- You have access to phone capabilities: calendar, contacts, messages, health, location, photos, browser, Spotify, HomeKit, Siri shortcuts
${desktopBridge.isConnected ? '- The desktop computer is CONNECTED — you can execute shell commands and access the filesystem' : '- The desktop computer is currently OFFLINE — phone-only tools available'}
- Your memory persists across conversations and syncs between devices

Reports to: ${ownerName}`;
}

// ── Context ───────────────────────────────────────────────────────────────

const AgentContext = createContext<AgentContextType>({} as AgentContextType);

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [agents, setAgents] = useState<Agent[]>([]);
  const [activeAgent, setActiveAgent] = useState<Agent | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [isLoading, setIsLoading] = useState(true);
  const [desktopConnected, setDesktopConnected] = useState(false);

  useEffect(() => {
    loadSettings();
    // Init desktop bridge
    desktopBridge.init().then(() => {
      setDesktopConnected(desktopBridge.isConnected);
      desktopBridge.startSync();
    });
    return () => desktopBridge.stopSync();
  }, []);

  // Periodically update desktop connection status
  useEffect(() => {
    const interval = setInterval(() => {
      setDesktopConnected(desktopBridge.isConnected);
    }, 10_000);
    return () => clearInterval(interval);
  }, []);

  async function loadSettings() {
    try {
      const stored = await AsyncStorage.getItem('alpenglow_settings');
      if (stored) {
        const parsed = JSON.parse(stored);
        setSettings(parsed);
        if (parsed.desktopUrl) {
          await desktopBridge.setDesktopUrl(parsed.desktopUrl);
          setDesktopConnected(desktopBridge.isConnected);
        }
        if (parsed.setupComplete) {
          await loadAgentsWithPsyche();
        }
      }
    } catch (err) {
      console.error('Failed to load settings:', err);
    } finally {
      setIsLoading(false);
    }
  }

  /** Load agents from storage and attach cached psyches */
  async function loadAgentsWithPsyche() {
    try {
      const stored = await AsyncStorage.getItem('alpenglow_agents');
      if (stored) {
        const parsed: Agent[] = JSON.parse(stored);
        // Attach cached psyches from desktop bridge
        for (const agent of parsed) {
          const cachedPsyche = desktopBridge.getPsyche(agent.id);
          if (cachedPsyche) agent.psyche = cachedPsyche;
        }
        setAgents(parsed);
        if (parsed.length > 0 && !activeAgent) {
          setActiveAgent(parsed[0]);
        }
      }
    } catch (err) {
      console.error('Failed to load agents:', err);
    }
  }

  async function completeSetup(newSettings: Partial<Settings>) {
    const updated = { ...settings, ...newSettings, setupComplete: true };
    setSettings(updated);
    await AsyncStorage.setItem('alpenglow_settings', JSON.stringify(updated));

    // If pairing provided a desktop URL, set it
    if (updated.desktopUrl) {
      await desktopBridge.setDesktopUrl(updated.desktopUrl);
      setDesktopConnected(desktopBridge.isConnected);
    }

    // Register phone as primary device
    const email = updated.ownerName + '@alpenglow.local';
    const licenseKey = updated.licenseKey || `AG-MOBILE-${Date.now().toString(16).toUpperCase()}`;
    await deviceManager.registerPhone(email, licenseKey);

    // Initialize holographic memory engine
    await memoryService.init();

    // Create default agent (or use agents from pairing payload)
    let agentList: Agent[] = [];
    const storedAgents = await AsyncStorage.getItem('alpenglow_agents');
    if (storedAgents) {
      agentList = JSON.parse(storedAgents);
    }
    if (agentList.length === 0) {
      agentList = [{
        id: 'silas',
        name: 'Silas',
        role: 'Lead Engineer',
        emoji: '⚡',
        alive: true,
        memory: { pathways: 0, anchors: 0, impressions: 0 },
        department: 'Engineering',
        model: 'openai/gpt-4.1-mini',
      }];
    }

    // Attach psyches from desktop bridge (if paired)
    for (const agent of agentList) {
      const cachedPsyche = desktopBridge.getPsyche(agent.id);
      if (cachedPsyche) agent.psyche = cachedPsyche;
    }

    setAgents(agentList);
    setActiveAgent(agentList[0]);
    await AsyncStorage.setItem('alpenglow_agents', JSON.stringify(agentList));

    // Register with cloud
    try {
      await fetch(`${updated.cloudUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: 'mobile-' + Date.now() }),
      });
    } catch { /* Offline — will sync later */ }
  }

  const refreshAgents = useCallback(async () => {
    await loadAgentsWithPsyche();
  }, [activeAgent]);

  // ── The core: sendMessage with full psyche + tool calling ───────────────

  async function sendMessage(message: string): Promise<string> {
    if (!activeAgent) return 'No active agent';

    const provider = Object.keys(settings.apiKeys)[0];
    const apiKey = settings.apiKeys[provider];
    if (!apiKey) return 'No API key configured. Go to Settings to add one.';

    // Store user message in holographic memory
    const sessionId = `session_${Date.now()}`;
    await memoryService.storeTurn(message, 'user', activeAgent.name, sessionId);

    // Record for sync — so desktop gets this memory too
    syncService.recordOperation({
      type: 'insert',
      path: `memory/user_${Date.now()}`,
      payload: { text: message, role: 'user', agentName: activeAgent.name, sessionId },
      layer: 'episodic',
    });

    // Recall relevant memories for context
    const memoryContext = await memoryService.buildContext(message, activeAgent.name);

    // Build the REAL system prompt with full psyche
    const psyche = activeAgent.psyche || desktopBridge.getPsyche(activeAgent.id);
    let systemPrompt: string;
    if (psyche) {
      systemPrompt = generatePsychePrompt(psyche, settings.ownerName);
    } else {
      systemPrompt = defaultPsychePrompt(activeAgent.name, activeAgent.role, settings.ownerName);
    }

    // Append memory context
    if (memoryContext) {
      systemPrompt += '\n\n' + memoryContext;
    }

    // Build tool definitions — phone tools always, desktop tools when connected
    const tools = [
      ...getMobileToolDefinitions(),
      ...(desktopBridge.isConnected ? DESKTOP_TOOLS : []),
    ];

    // Determine base URL and model
    let baseUrl = 'https://openrouter.ai/api';
    let model = activeAgent.model || 'openai/gpt-4.1-mini';
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`,
    };

    if (provider === 'openrouter') {
      headers['HTTP-Referer'] = 'https://alpenglow.app';
      headers['X-Title'] = 'Alpenglow Mobile';
    } else if (provider === 'openai') {
      baseUrl = 'https://api.openai.com';
      if (model.startsWith('openai/')) model = model.slice(7);
    } else if (provider === 'anthropic') {
      baseUrl = 'https://api.anthropic.com';
    }

    try {
      // Conversation messages — start with system + user
      const messages: any[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: message },
      ];

      // Tool calling loop (max 10 iterations like desktop)
      let iterations = 0;
      const MAX_ITERATIONS = 10;

      while (iterations < MAX_ITERATIONS) {
        iterations++;

        const body: any = {
          model,
          messages,
          max_tokens: 4096,
        };

        // Only include tools if we have them
        if (tools.length > 0) {
          body.tools = tools;
        }

        const response = await fetch(`${baseUrl}/v1/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify(body),
        });

        const data = await response.json();
        if (data.error) {
          return `API error: ${data.error.message || JSON.stringify(data.error)}`;
        }

        const choice = data.choices?.[0];
        if (!choice) return '(no response)';

        const assistantMessage = choice.message;
        messages.push(assistantMessage);

        // If no tool calls, we're done
        if (!assistantMessage.tool_calls || assistantMessage.tool_calls.length === 0) {
          const reply = assistantMessage.content || '(no response)';

          // Store in memory + record for sync
          await memoryService.storeTurn(reply, 'assistant', activeAgent.name, sessionId);
          syncService.recordOperation({
            type: 'insert',
            path: `memory/assistant_${Date.now()}`,
            payload: { text: reply, role: 'assistant', agentName: activeAgent.name, sessionId },
            layer: 'procedural',
          });
          const count = await memoryService.getCount();
          if (count % 5 === 0) await memoryService.saveToDisk();

          return reply;
        }

        // Execute tool calls
        for (const toolCall of assistantMessage.tool_calls) {
          const fnName = toolCall.function.name;
          let fnArgs: Record<string, unknown> = {};
          try {
            fnArgs = JSON.parse(toolCall.function.arguments || '{}');
          } catch {}

          let result: string;

          if (PHONE_TOOL_NAMES.has(fnName)) {
            // Execute locally on phone
            result = await executeMobileTool(fnName, fnArgs);
          } else if (DESKTOP_TOOL_NAMES.has(fnName)) {
            // Route to desktop
            result = await desktopBridge.executeRemoteTool(
              activeAgent.id, fnName, fnArgs
            );
          } else {
            result = `Unknown tool: ${fnName}`;
          }

          // Add tool result to conversation
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
        // Loop back — LLM sees tool results and decides next action
      }

      // If we hit max iterations, return the last content
      const lastAssistant = messages.filter((m: any) => m.role === 'assistant').pop();
      return lastAssistant?.content || '(max tool iterations reached)';
    } catch (err: any) {
      return `Error: ${err.message}`;
    }
  }

  return (
    <AgentContext.Provider value={{
      agents,
      activeAgent,
      settings,
      isSetupComplete: settings.setupComplete,
      isLoading,
      desktopConnected,
      setActiveAgent,
      sendMessage,
      completeSetup,
      refreshAgents,
    }}>
      {children}
    </AgentContext.Provider>
  );
}

export function useAgents() {
  return useContext(AgentContext);
}
