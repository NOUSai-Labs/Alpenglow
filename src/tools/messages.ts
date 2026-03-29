/**
 * Messages Tool — MessageUI (iOS) / SmsManager (Android)
 * Send texts, read recent messages
 */
import { NativeModules } from 'react-native';

const { MessagesBridge } = NativeModules;

export const messagesTool = {
  name: 'messages',
  description: 'Send and read text messages/iMessages',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'send': {
          const to = args.to as string;
          const body = args.body as string;
          await MessagesBridge.send(to, body);
          return `Message sent to ${to}`;
        }
        case 'recent': {
          const count = (args.count as number) || 20;
          const messages = await MessagesBridge.getRecent(count);
          return messages.map((m: any) => `${m.from} (${m.date}): ${m.body}`).join('\n');
        }
        default:
          return `Unknown messages operation: ${operation}`;
      }
    } catch (err: any) {
      return `Messages error: ${err.message}`;
    }
  }
};
