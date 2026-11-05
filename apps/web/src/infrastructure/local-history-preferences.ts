import { z } from 'zod';
import { logger } from '@/shared';

const STORAGE_KEY = 'texas-holdem:history-max-hands';
export const HISTORY_LIMIT_OPTIONS = [100, 500, 1000, 5000] as const;
export const DEFAULT_HISTORY_LIMIT = 1000;

const limitSchema = z.number().int().min(10).max(100_000);

/** How many hands to keep — a per-browser preference, validated like every other stored value. */
export class LocalHistoryPreferences {
  getMaxHands(): number {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw === null) return DEFAULT_HISTORY_LIMIT;
      const parsed = limitSchema.safeParse(Number(raw));
      return parsed.success ? parsed.data : DEFAULT_HISTORY_LIMIT;
    } catch (error) {
      logger.warn('Failed to read the hand history limit', { error });
      return DEFAULT_HISTORY_LIMIT;
    }
  }

  setMaxHands(maxHands: number): void {
    const parsed = limitSchema.safeParse(maxHands);
    if (!parsed.success) return;
    try {
      localStorage.setItem(STORAGE_KEY, String(parsed.data));
    } catch (error) {
      logger.warn('Failed to store the hand history limit', { error });
    }
  }
}
