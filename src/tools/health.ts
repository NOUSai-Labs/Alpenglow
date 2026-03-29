/**
 * Health Tool — HealthKit (iOS) / Health Connect (Android)
 * Read health data — steps, heart rate, sleep, workouts
 */
import { NativeModules, Platform } from 'react-native';

const { HealthBridge } = NativeModules;

export const healthTool = {
  name: 'health',
  description: 'Read health data — steps, heart rate, sleep, workouts, activity',

  async execute(args: Record<string, unknown>): Promise<string> {
    const operation = args.operation as string;

    try {
      switch (operation) {
        case 'steps': {
          const date = args.date as string || new Date().toISOString().split('T')[0];
          const steps = await HealthBridge.getSteps(date);
          return `Steps on ${date}: ${steps.toLocaleString()}`;
        }
        case 'heartrate': {
          const samples = await HealthBridge.getHeartRate(args.hours as number || 24);
          const avg = samples.reduce((a: number, b: any) => a + b.value, 0) / samples.length;
          return `Heart rate (last ${args.hours || 24}h): avg ${Math.round(avg)} BPM, ${samples.length} readings`;
        }
        case 'sleep': {
          const date = args.date as string || new Date().toISOString().split('T')[0];
          const sleep = await HealthBridge.getSleep(date);
          return `Sleep on ${date}: ${sleep.totalHours}h (${sleep.deepHours}h deep, ${sleep.remHours}h REM)`;
        }
        case 'workout': {
          const recent = await HealthBridge.getWorkouts(args.days as number || 7);
          if (recent.length === 0) return 'No workouts recorded';
          return recent.map((w: any) => `${w.date}: ${w.type} — ${w.duration}min, ${w.calories} cal`).join('\n');
        }
        case 'summary': {
          const today = new Date().toISOString().split('T')[0];
          const steps = await HealthBridge.getSteps(today);
          const hr = await HealthBridge.getHeartRate(4);
          const avgHr = hr.length > 0 ? Math.round(hr.reduce((a: number, b: any) => a + b.value, 0) / hr.length) : 'N/A';
          return `Today's health:\n  Steps: ${steps.toLocaleString()}\n  Heart rate: ${avgHr} BPM avg (last 4h)\n  Active calories: checking...`;
        }
        default:
          return `Unknown health operation: ${operation}`;
      }
    } catch (err: any) {
      return `Health error: ${err.message}`;
    }
  }
};
