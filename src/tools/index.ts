/**
 * Mobile Tool Registry
 * All native phone capabilities the agent can use
 */
import { calendarTool } from './calendar';
import { contactsTool } from './contacts';
import { messagesTool } from './messages';
import { homekitTool } from './homekit';
import { healthTool } from './health';
import { mediaTool } from './media';
import { locationTool } from './location';
import { shortcutsTool } from './shortcuts';
import { remindersTool } from './reminders';
import { photosTool } from './photos';
import { browserTool } from './browser';
import { spotifyTool } from './spotify';

export const MOBILE_TOOLS = {
  calendar: calendarTool,
  contacts: contactsTool,
  messages: messagesTool,
  homekit: homekitTool,
  health: healthTool,
  media: mediaTool,
  location: locationTool,
  shortcuts: shortcutsTool,
  reminders: remindersTool,
  photos: photosTool,
  browser: browserTool,
  spotify: spotifyTool,
};

export type MobileToolName = keyof typeof MOBILE_TOOLS;

export async function executeMobileTool(name: string, args: Record<string, unknown>): Promise<string> {
  const tool = MOBILE_TOOLS[name as MobileToolName];
  if (!tool) return `Unknown tool: ${name}`;
  return tool.execute(args);
}

export function getMobileToolDefinitions() {
  return Object.entries(MOBILE_TOOLS).map(([name, tool]) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
    },
  }));
}

export { calendarTool, contactsTool, messagesTool, homekitTool, healthTool, mediaTool, locationTool, shortcutsTool, remindersTool, photosTool, browserTool, spotifyTool };
