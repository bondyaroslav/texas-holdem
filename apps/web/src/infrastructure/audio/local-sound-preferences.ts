import { z } from 'zod';
import { logger, type SoundSettings } from '@/shared';

const STORAGE_KEY = 'texas-holdem:sound';

export const DEFAULT_SOUND_SETTINGS: SoundSettings = { enabled: true, volume: 0.6 };

const soundSettingsSchema = z.object({
  schemaVersion: z.literal(1),
  enabled: z.boolean(),
  volume: z.number().min(0).max(1),
});

/** Sound on/off and volume — a per-browser preference, validated like every stored value. */
export class LocalSoundPreferences {
  load(): SoundSettings {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return DEFAULT_SOUND_SETTINGS;
      const parsed = soundSettingsSchema.safeParse(JSON.parse(raw));
      if (!parsed.success) {
        logger.warn('Stored sound settings failed validation — using defaults', {
          issues: parsed.error.issues,
        });
        return DEFAULT_SOUND_SETTINGS;
      }
      return { enabled: parsed.data.enabled, volume: parsed.data.volume };
    } catch (error) {
      logger.warn('Failed to read sound settings', { error });
      return DEFAULT_SOUND_SETTINGS;
    }
  }

  save(settings: SoundSettings): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 1, ...settings }));
    } catch (error) {
      logger.warn('Failed to store sound settings', { error });
    }
  }
}
