import { describe, expect, it } from 'vitest';
import { botDifficultyForSeat, tableConfigSchema } from './table-config.js';

describe('tableConfigSchema', () => {
  it('accepts a valid table config and fills in defaults', () => {
    const result = tableConfigSchema.safeParse({
      schemaVersion: 1,
      botCount: 5,
      startingStack: 10_000,
      smallBlind: 50,
      bigBlind: 100,
    });

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.ante).toBe(0);
      expect(result.data.isTournament).toBe(false);
      expect(result.data.botDifficulty).toBe('easy');
    }
  });

  it('rejects an invalid bot count', () => {
    const result = tableConfigSchema.safeParse({
      schemaVersion: 1,
      botCount: 9,
      startingStack: 10_000,
      smallBlind: 50,
      bigBlind: 100,
    });

    expect(result.success).toBe(false);
  });

  it('accepts every bot level and a mixed table, and rejects unknown levels', () => {
    const base = {
      schemaVersion: 1,
      botCount: 5,
      startingStack: 10_000,
      smallBlind: 50,
      bigBlind: 100,
    };
    for (const botDifficulty of ['beginner', 'easy', 'medium', 'hard', 'expert', 'mixed']) {
      expect(tableConfigSchema.safeParse({ ...base, botDifficulty }).success).toBe(true);
    }
    expect(tableConfigSchema.safeParse({ ...base, botDifficulty: 'godlike' }).success).toBe(false);
  });

  it('deals the levels of a mixed table out seat by seat', () => {
    const config = tableConfigSchema.parse({
      schemaVersion: 1,
      botCount: 5,
      startingStack: 1000,
      smallBlind: 5,
      bigBlind: 10,
      botDifficulty: 'mixed',
    });
    expect([0, 1, 2, 3, 4].map((i) => botDifficultyForSeat(config, i))).toEqual([
      'easy',
      'medium',
      'hard',
      'expert',
      'easy',
    ]);
    expect(botDifficultyForSeat({ ...config, botDifficulty: 'hard' }, 3)).toBe('hard');
  });
});
