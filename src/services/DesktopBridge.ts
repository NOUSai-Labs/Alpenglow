/**
 * DesktopBridge — Connects mobile to the paired desktop server.
 *
 * When the desktop is reachable, the phone can:
 *   1. Execute desktop-only tools (shell, filesystem, apps)
 *   2. Sync memory bidirectionally
 *   3. Pull the full agent psyche (identity, personality, beliefs)
 *
 * When the desktop is OFFLINE, the phone works independently
 * with its local psyche copy + local memory. No games.
 */
import AsyncStorage from '@react-native-async-storage/async-storage';
import { executeMobileTool } from '../tools';

const STORAGE_KEY = 'alpenglow_desktop_bridge';
const PSYCHE_KEY = 'alpenglow_agent_psyches';
const PROBE_TIMEOUT = 3000;
const SYNC_INTERVAL = 30_000; // 30s

export interface PsycheCore {
  name: string;
  role: string;
  personality: string[];
  beliefs: string[];
  boundaries: string[];
  owner: string;
  team: { name: string; role: string }[];
  emoji: string;
  vibe: string;
}

export interface DesktopAgent {
  id: string;
  name: string;
  role: string;
  emoji: string;
  psyche?: PsycheCore;
}

interface BridgeState {
  desktopUrl: string | null;
  connected: boolean;
  lastSync: number;
  psyches: Record<string, PsycheCore>; // agentId → psyche
}

class DesktopBridgeService {
  private state: BridgeState = {
    desktopUrl: null,
    connected: false,
    lastSync: 0,
    psyches: {},
  };
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private toolPollTimer: ReturnType<typeof setInterval> | null = null;

  async init() {
    // Load persisted bridge state (desktop URL, cached psyches)
    try {
      const stored = await AsyncStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.state.desktopUrl = parsed.desktopUrl || null;
      }
      const psyches = await AsyncStorage.getItem(PSYCHE_KEY);
      if (psyches) {
        this.state.psyches = JSON.parse(psyches);
      }
    } catch {}

    // If we have a desktop URL, probe it
    if (this.state.desktopUrl) {
      await this.probe();
    }
  }

  /** Set the desktop URL from pairing */
  async setDesktopUrl(url: string) {
    this.state.desktopUrl = url;
    await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ desktopUrl: url }));
    await this.probe();
  }

  /** Check if desktop is reachable */
  async probe(): Promise<boolean> {
    if (!this.state.desktopUrl) {
      this.state.connected = false;
      return false;
    }
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), PROBE_TIMEOUT);
      const res = await fetch(`${this.state.desktopUrl}/api/pairing/announce`, {
        signal: controller.signal,
      });
      clearTimeout(timeout);
      this.state.connected = res.ok;
      if (this.state.connected) {
        // Pull psyches on reconnect
        await this.syncPsyches();
      }
      return this.state.connected;
    } catch {
      this.state.connected = false;
      return false;
    }
  }

  get isConnected() { return this.state.connected; }
  get desktopUrl() { return this.state.desktopUrl; }

  /** Get cached psyche for an agent (works offline) */
  getPsyche(agentId: string): PsycheCore | null {
    return this.state.psyches[agentId] || null;
  }

  /** Pull all agent psyches from desktop and cache locally */
  async syncPsyches(): Promise<void> {
    if (!this.state.connected || !this.state.desktopUrl) return;
    try {
      const res = await fetch(`${this.state.desktopUrl}/api/agents`);
      if (!res.ok) return;
      const data = await res.json();
      const agents = data.agents || [];
      for (const agent of agents) {
        if (agent.psyche) {
          this.state.psyches[agent.id] = agent.psyche;
        }
      }
      await AsyncStorage.setItem(PSYCHE_KEY, JSON.stringify(this.state.psyches));
    } catch {}
  }

  /**
   * Execute a tool on the desktop server.
   * Used for desktop-only capabilities: shell commands, filesystem, opening apps.
   */
  async executeRemoteTool(agentId: string, toolName: string, args: Record<string, unknown>): Promise<string> {
    if (!this.state.connected || !this.state.desktopUrl) {
      return `Desktop is offline. Cannot execute ${toolName} remotely.`;
    }
    try {
      const res = await fetch(`${this.state.desktopUrl}/api/tools/execute`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentId, tool: toolName, args }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        return `Remote tool error: ${err.error || res.statusText}`;
      }
      const data = await res.json();
      return data.result || data.output || JSON.stringify(data);
    } catch (err: any) {
      return `Desktop unreachable: ${err.message}`;
    }
  }

  /**
   * Send a chat message through the desktop agent runtime.
   * This gives the phone access to the full desktop agent with all its tools,
   * memory, psyche, and capabilities. The response comes back when done.
   *
   * Returns null if desktop is unreachable (caller should fall back to local).
   */
  async sendViaDesktop(agentId: string, message: string, sender: string): Promise<string | null> {
    if (!this.state.connected || !this.state.desktopUrl) return null;
    try {
      // Send the message
      const res = await fetch(`${this.state.desktopUrl}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent: agentId, message, sender, channel: `mobile:${sender}:${agentId}` }),
      });
      if (!res.ok) return null;

      // The desktop API returns immediately with { ok: true, processing: true }
      // The actual response comes via polling /api/chat/messages
      // Poll for the response
      const channel = `mobile:${sender}:${agentId}`;
      const startTime = Date.now();
      const maxWait = 120_000; // 2 minutes max

      while (Date.now() - startTime < maxWait) {
        await new Promise(r => setTimeout(r, 1500)); // poll every 1.5s
        try {
          const pollRes = await fetch(
            `${this.state.desktopUrl}/api/chat/messages?channel=${encodeURIComponent(channel)}&since=${startTime}`
          );
          if (!pollRes.ok) continue;
          const pollData = await pollRes.json();
          const messages = pollData.messages || [];
          // Find the latest assistant message after our send
          const assistantMsgs = messages.filter(
            (m: any) => m.role === 'assistant' && new Date(m.created_at).getTime() > startTime
          );
          if (assistantMsgs.length > 0) {
            return assistantMsgs[assistantMsgs.length - 1].content;
          }
        } catch { /* keep polling */ }
      }
      return null; // timeout
    } catch {
      return null;
    }
  }

  /** Start periodic sync + tool polling */
  startSync() {
    if (this.syncTimer) return;
    this.syncTimer = setInterval(async () => {
      await this.probe();
      // Poll for tool requests from desktop
      if (this.state.connected) {
        await this.pollToolRequests();
      }
    }, SYNC_INTERVAL);

    // Poll for tools more frequently (every 2s) when connected
    this.toolPollTimer = setInterval(async () => {
      if (this.state.connected) {
        await this.pollToolRequests();
      }
    }, 2000);
  }

  /** Stop periodic sync */
  stopSync() {
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }
    if (this.toolPollTimer) {
      clearInterval(this.toolPollTimer);
      this.toolPollTimer = null;
    }
  }

  /**
   * Poll desktop for pending tool requests and execute them locally.
   * This is how desktop Silas controls the phone — he queues a tool request,
   * the phone picks it up, executes it, and returns the result.
   */
  private async pollToolRequests(): Promise<void> {
    if (!this.state.desktopUrl) return;

    try {
      const res = await fetch(`${this.state.desktopUrl}/api/mobile/tools/poll`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ deviceId: 'phone' }),
        signal: AbortSignal.timeout?.(3000) || undefined,
      });
      if (!res.ok) return;

      const data = await res.json();
      const requests = data.requests || [];

      for (const req of requests) {
        console.log(`[bridge] Executing mobile tool: ${req.tool}(${JSON.stringify(req.args).slice(0, 60)})`);

        let result: string;
        try {
          result = await executeMobileTool(req.tool, req.args || {});
        } catch (err: any) {
          result = `Error: ${err.message}`;
        }

        // Send result back to desktop
        try {
          await fetch(`${this.state.desktopUrl}/api/mobile/tools/result`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: req.id, result }),
            signal: AbortSignal.timeout?.(5000) || undefined,
          });
        } catch (err: any) {
          console.warn(`[bridge] Failed to send tool result: ${err.message}`);
        }
      }
    } catch { /* silent — desktop might be busy */ }
  }
}

export const desktopBridge = new DesktopBridgeService();
