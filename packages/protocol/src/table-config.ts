import { z } from 'zod';

export const BOT_DIFFICULTIES = ['beginner', 'easy', 'medium', 'hard', 'expert'] as const;
export type BotDifficulty = (typeof BOT_DIFFICULTIES)[number];

/** Levels a "mixed" table deals out to its bots, seat by seat. */
const MIXED_ROTATION: readonly BotDifficulty[] = ['easy', 'medium', 'hard', 'expert'];

export const tableConfigSchema = z.object({
  schemaVersion: z.literal(1),
  botCount: z.number().int().min(1).max(8),
  startingStack: z.number().int().positive(),
  smallBlind: z.number().int().positive(),
  bigBlind: z.number().int().positive(),
  ante: z.number().int().min(0).default(0),
  isTournament: z.boolean().default(false),
  // One level for every bot, or `mixed` for a table of different levels (CLAUDE.md §5).
  botDifficulty: z.enum([...BOT_DIFFICULTIES, 'mixed']).default('easy'),
});

export type TableConfig = z.infer<typeof tableConfigSchema>;

/** The level of the `botIndex`-th bot (0-based) at a table with this config. */
export function botDifficultyForSeat(config: TableConfig, botIndex: number): BotDifficulty {
  if (config.botDifficulty !== 'mixed') return config.botDifficulty;
  return MIXED_ROTATION[botIndex % MIXED_ROTATION.length] ?? 'medium';
}
