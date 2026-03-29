/**
 * Contacts Tool — Contacts framework (iOS) / ContactsContract (Android)
 * Search, create, update contacts
 */
import { NativeModules } from 'react-native';

const { ContactsBridge } = NativeModules;

export const contactsTool = {
  name: 'contacts',
  description: 'Manage contacts — search, create, update, get details',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'search': {
          const query = args.query as string;
          const results = await ContactsBridge.search(query);
          if (results.length === 0) return `No contacts found for "${query}"`;
          return results.map((c: any) => `${c.name} — ${c.phone || 'no phone'} — ${c.email || 'no email'}`).join('\n');
        }
        case 'create': {
          const id = await ContactsBridge.create({
            firstName: args.firstName as string,
            lastName: args.lastName as string,
            phone: args.phone as string,
            email: args.email as string,
            company: args.company as string,
          });
          return `Created contact ${args.firstName} ${args.lastName} (ID: ${id})`;
        }
        case 'get': {
          const contact = await ContactsBridge.getById(args.contactId as string);
          return JSON.stringify(contact, null, 2);
        }
        default:
          return `Unknown contacts operation: ${operation}`;
      }
    } catch (err: any) {
      return `Contacts error: ${err.message}`;
    }
  }
};
