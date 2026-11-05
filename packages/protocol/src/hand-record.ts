import { z } from 'zod';
import type { Card, Chips, EngineEvent, PlayerId } from '@poker/engine';
import {
  BOT_DIFFICULTIES,
  tableConfigSchema,
  type BotDifficulty,
  type TableConfig,
} from './table-config.js';
import { card, chips, playerId, street } from './primitives.js';

const actionInput = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fold') }),
  z.object({ kind: z.literal('check') }),
  z.object({ kind: z.literal('call') }),
  z.object({ kind: z.literal('bet'), amount: chips }),
  z.object({ kind: z.literal('raise'), amount: chips }),
  z.object({ kind: z.literal('allIn') }),
]);

/** Mirrors the engine's `EngineEvent` union — the single source for replay, analysis and hand-history text. */
export const engineEventSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('handStarted'),
    handNumber: z.number().int().nonnegative(),
    dealerIndex: z.number().int().nonnegative(),
  }),
  z.object({
    type: z.literal('blindsPosted'),
    playerId,
    amount: chips,
    kind: z.enum(['ante', 'smallBlind', 'bigBlind']),
  }),
  z.object({ type: z.literal('cardsDealt'), playerId, cards: z.array(card) }),
  z.object({ type: z.literal('actionTaken'), playerId, action: actionInput }),
  z.object({
    type: z.literal('streetAdvanced'),
    street,
    communityCards: z.array(card),
  }),
  z.object({ type: z.literal('potAwarded'), playerId, amount: chips }),
  z.object({ type: z.literal('handEnded') }),
]);

const handRecordPlayer = z.object({
  id: playerId,
  seat: z.number().int().nonnegative(),
  /** Bot tier, or `null` for the human. */
  botDifficulty: z.enum(BOT_DIFFICULTIES).nullable(),
  startingStack: chips,
  endingStack: chips,
  /** Hole cards of every dealt player, including those who folded. */
  holeCards: z.array(card),
});

export const handRecordSchema = z.object({
  schemaVersion: z.literal(1),
  id: z.string().min(1),
  tableId: z.string().min(1),
  handNumber: z.number().int().positive(),
  /** Seeds the shuffle for this hand: same seed + same table state → same deal. */
  seed: z.number().int().nonnegative(),
  startedAt: z.number().int().nonnegative(),
  endedAt: z.number().int().nonnegative(),
  config: tableConfigSchema,
  blinds: z.object({ smallBlind: chips, bigBlind: chips, ante: chips }),
  dealerIndex: z.number().int().nonnegative(),
  /** The seat the person at the keyboard occupied. */
  heroId: playerId,
  players: z.array(handRecordPlayer).min(2),
  /** Community cards that were actually dealt (fewer than 5 when everyone folded early). */
  board: z.array(card).max(5),
  /** Cards never dealt, top of the deck first — lets analysis replay "what would have come". */
  undealtCards: z.array(card),
  events: z.array(engineEventSchema),
});

/** Complete, self-contained record of one finished hand (all cards, all events, seed). */
export interface HandRecord {
  readonly schemaVersion: 1;
  readonly id: string;
  readonly tableId: string;
  readonly handNumber: number;
  readonly seed: number;
  readonly startedAt: number;
  readonly endedAt: number;
  readonly config: TableConfig;
  readonly blinds: {
    readonly smallBlind: Chips;
    readonly bigBlind: Chips;
    readonly ante: Chips;
  };
  readonly dealerIndex: number;
  readonly heroId: PlayerId;
  readonly players: readonly HandRecordPlayer[];
  readonly board: readonly Card[];
  readonly undealtCards: readonly Card[];
  readonly events: readonly EngineEvent[];
}

export interface HandRecordPlayer {
  readonly id: PlayerId;
  readonly seat: number;
  readonly botDifficulty: BotDifficulty | null;
  readonly startingStack: Chips;
  readonly endingStack: Chips;
  readonly holeCards: readonly Card[];
}
