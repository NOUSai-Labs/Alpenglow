/**
 * Reminders Tool — EventKit Reminders (iOS) / Tasks API (Android)
 * Create, list, complete reminders
 */
import { NativeModules } from 'react-native';

const { RemindersBridge } = NativeModules;

export const remindersTool = {
  name: 'reminders',
  description: 'Manage reminders — create, list, complete, set due dates and priorities',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'list': {
          const showCompleted = args.showCompleted as boolean || false;
          const reminders = await RemindersBridge.getAll(showCompleted);
          if (reminders.length === 0) return 'No reminders';
          return reminders.map((r: any) => `${r.completed ? '✅' : '⬜'} ${r.title}${r.dueDate ? ` (due: ${r.dueDate})` : ''}`).join('\n');
        }
        case 'create': {
          const id = await RemindersBridge.create({
            title: args.title as string,
            notes: args.notes as string,
            dueDate: args.dueDate as string,
            priority: args.priority as number || 0,
            list: args.list as string,
          });
          return `Created reminder: "${args.title}" (ID: ${id})`;
        }
        case 'complete': {
          await RemindersBridge.complete(args.reminderId as string);
          return `Marked reminder as complete`;
        }
        case 'delete': {
          await RemindersBridge.remove(args.reminderId as string);
          return `Deleted reminder`;
        }
        default:
          return `Unknown reminders operation: ${operation}`;
      }
    } catch (err: any) {
      return `Reminders error: ${err.message}`;
    }
  }
};
