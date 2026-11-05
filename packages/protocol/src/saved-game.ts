import { z } from 'zod';
import type { GameState } from '@poker/engine';
import { card, chips, playerId } from './primitives.js';
import { tableConfigSchema, type TableConfig } from './table-config.js';

const seatedPlayer = z.object({
  id: playerId,
  stack: chips,
  holeCards: z.array(card),
  status: z.enum(['active', 'folded', 'allIn', 'sittingOut']),
  committedThisStreet: chips,
  committedTotal: chips,
});

export const gameStateSchema = z.object({
  street: z.enum(['idle', 'preflop', 'flop', 'turn', 'river', 'showdown']),
  deck: z.array(card),
  communityCards: z.array(card),
  players: z.array(seatedPlayer),
  dealerIndex: z.number().int().nonnegative(),
  firstToActPostflopIndex: z.number().int().nonnegative(),
  toAct: z.array(playerId),
  actingPlayerId: playerId.nullable(),
  blinds: z.object({ smallBlind: chips, bigBlind: chips, ante: chips }),
  pot: chips,
  currentBet: chips,
  minRaise: chips,
  handNumber: z.number().int().nonnegative(),
});

export const savedGameSchema = z.object({
  schemaVersion: z.literal(1),
  config: tableConfigSchema,
  state: gameStateSchema,
});

/** Everything needed to resume a table: the config it was created with plus the full engine state. */
export interface SavedGame {
  readonly schemaVersion: 1;
  readonly config: TableConfig;
  readonly state: GameState;
}

/** True when two configs describe the same table (flat objects, key order irrelevant). */
export function isSameTableConfig(a: TableConfig, b: TableConfig): boolean {
  const keys = Object.keys(tableConfigSchema.shape) as (keyof TableConfig)[];
  return keys.every((key) => a[key] === b[key]);
}
