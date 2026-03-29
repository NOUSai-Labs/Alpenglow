/**
 * Shortcuts Tool — Shortcuts/Intents framework (iOS)
 * Run Siri Shortcuts, create automations, system actions
 */
import { NativeModules, Platform } from 'react-native';

const { ShortcutsBridge } = NativeModules;

export const shortcutsTool = {
  name: 'shortcuts',
  description: 'Run Siri Shortcuts, create automations, trigger system actions',

  async execute(args: Record<string, unknown>): Promise<string> {
    if (Platform.OS !== 'ios') return 'Shortcuts are only available on iOS';

    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'run': {
          const name = args.shortcut as string;
          const input = args.input as Record<string, unknown>;
          const result = await ShortcutsBridge.runShortcut(name, input);
          return `Shortcut "${name}" completed: ${result || 'success'}`;
        }
        case 'list': {
          const shortcuts = await ShortcutsBridge.listShortcuts();
          return shortcuts.map((s: any) => `${s.name} — ${s.actionCount} actions`).join('\n');
        }
        case 'system': {
          const action = args.action as string;
          switch (action) {
            case 'flashlight':
              await ShortcutsBridge.toggleFlashlight();
              return 'Flashlight toggled';
            case 'screenshot':
              await ShortcutsBridge.takeScreenshot();
              return 'Screenshot taken';
            case 'dnd':
              await ShortcutsBridge.toggleDoNotDisturb();
              return 'Do Not Disturb toggled';
            case 'lowpower':
              await ShortcutsBridge.toggleLowPowerMode();
              return 'Low Power Mode toggled';
            default:
              return `Unknown system action: ${action}`;
          }
        }
        default:
          return `Unknown shortcuts operation: ${operation}`;
      }
    } catch (err: any) {
      return `Shortcuts error: ${err.message}`;
    }
  }
};
