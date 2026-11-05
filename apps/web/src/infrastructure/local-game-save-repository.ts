import { savedGameSchema, type GameSaveRepository, type SavedGame } from '@poker/protocol';
import { logger } from '@/shared';

const STORAGE_KEY = 'texas-holdem:saved-game';

/**
 * localStorage-backed `GameSaveRepository`. Never throws — a corrupted save is
 * dropped so the player simply gets a fresh table (CLAUDE.md §6).
 */
export class LocalGameSaveRepository implements GameSaveRepository {
  load(): SavedGame | null {
    let raw: string | null;
    try {
      raw = localStorage.getItem(STORAGE_KEY);
    } catch (error) {
      logger.warn('Failed to read saved game from localStorage', { error });
      return null;
    }
    if (!raw) {
      return null;
    }

    let parsedJson: unknown;
    try {
      parsedJson = JSON.parse(raw);
    } catch (error) {
      logger.warn('Saved game is not valid JSON — ignoring it', { error });
      return null;
    }

    const result = savedGameSchema.safeParse(parsedJson);
    if (!result.success) {
      logger.warn('Saved game failed validation — ignoring it', { issues: result.error.issues });
      return null;
    }
    return result.data;
  }

  save(game: SavedGame): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(game));
    } catch (error) {
      logger.warn('Failed to persist saved game to localStorage', { error });
    }
  }

  clear(): void {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch (error) {
      logger.warn('Failed to clear saved game from localStorage', { error });
    }
  }
}
