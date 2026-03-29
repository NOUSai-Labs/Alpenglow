/**
 * Calendar Tool — EventKit (iOS) / CalendarProvider (Android)
 * Create, read, update, delete calendar events
 * Check availability, find conflicts, manage reminders
 */
import { NativeModules, Platform } from 'react-native';

const { CalendarBridge } = NativeModules;

export interface CalendarEvent {
  id?: string;
  title: string;
  startDate: string; // ISO 8601
  endDate: string;
  location?: string;
  notes?: string;
  calendarId?: string;
  allDay?: boolean;
  recurrence?: 'daily' | 'weekly' | 'monthly' | 'yearly';
  alerts?: number[]; // minutes before
}

export const calendarTool = {
  name: 'calendar',
  description: 'Manage calendar events — create, read, update, delete, check availability',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'list': {
          const startDate = args.startDate as string || new Date().toISOString();
          const days = (args.days as number) || 7;
          const endDate = new Date(new Date(startDate).getTime() + days * 86400000).toISOString();
          const events = await CalendarBridge.getEvents(startDate, endDate);
          return JSON.stringify(events, null, 2);
        }
        case 'create': {
          const event: CalendarEvent = {
            title: args.title as string,
            startDate: args.startDate as string,
            endDate: args.endDate as string,
            location: args.location as string,
            notes: args.notes as string,
            allDay: args.allDay as boolean,
          };
          const id = await CalendarBridge.createEvent(event);
          return `Created event "${event.title}" (ID: ${id})`;
        }
        case 'delete': {
          await CalendarBridge.deleteEvent(args.eventId as string);
          return `Deleted event ${args.eventId}`;
        }
        case 'availability': {
          const date = args.date as string || new Date().toISOString();
          const events = await CalendarBridge.getEvents(date, new Date(new Date(date).getTime() + 86400000).toISOString());
          if (events.length === 0) return 'No events — fully available';
          return `${events.length} events:\n${events.map((e: any) => `  ${e.startDate} - ${e.endDate}: ${e.title}`).join('\n')}`;
        }
        default:
          return `Unknown calendar operation: ${operation}`;
      }
    } catch (err: any) {
      return `Calendar error: ${err.message}`;
    }
  }
};
