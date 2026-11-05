import { tableConfigSchema, type SettingsRepository, type TableConfig } from '@poker/protocol';
import { logger } from '@/shared';

const STORAGE_KEY = 'texas-holdem:table-config';

/**
 * localStorage-backed `SettingsRepository`. Never throws — corrupted or
 * missing data falls back to `null` so the caller can use its own default
 * (CLAUDE.md §6: "Дані з localStorage — завжди через Zod; пошкоджене
 * збереження → безпечний фолбек + повідомлення").
 */
export class LocalSettingsRepository implements SettingsRepository {
  load(): TableConfig | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      logger.warn('Failed to read table config from localStorage', { error });
      return null;
    }
    if (!raw) {
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      logger.warn('Stored table config is not valid JSON — ignoring it', { error });
      return null;
    }

    const result = tableConfigSchema.safeParse(parsedJson);
    if (!result.success) {
      logger.warn('Stored table config failed validation — ignoring it', {
        issues: result.error.issues,
      });
      return null;
    }
    return result.data;
  }

  save(config: TableConfig): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
    } catch (error) {
      logger.warn('Failed to persist table config to localStorage', { error });
    }
  }
}
