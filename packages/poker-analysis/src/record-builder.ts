import {
  toChips,
  toPlayerId,
  type ActionInput,
  type EngineEvent,
  type PlayerId,
} from '@poker/engine';
import type { HandRecord } from '@poker/protocol';
import { cards } from './test-helpers.js';

export interface SeatSpec {
  readonly id: string;
  readonly cards: string;
  readonly stack?: number;
  /** Stack after the hand; defaults to the starting stack. */
  readonly end?: number;
}

/** Test-only: a `HandRecord` from seats and a hand-written event list. */
export function buildRecord(input: {
  readonly seats: readonly SeatSpec[];
  readonly events: readonly EngineEvent[];
  readonly dealerIndex?: number;
  readonly heroId?: string;
  readonly smallBlind?: number;
  readonly bigBlind?: number;
}): HandRecord {
  const smallBlind = input.smallBlind ?? 5;
  const bigBlind = input.bigBlind ?? 10;
  const heroId = toPlayerId(input.heroId ?? 'hero');
  const board = input.events.flatMap((e) => (e.type === 'streetAdvanced' ? e.communityCards : []));
  return {
    schemaVersion: 1,
    id: 'hand-test',
    tableId: 'local-table',
    handNumber: 1,
    seed: 99,
    startedAt: 1,
    endedAt: 2,
    config: {
      schemaVersion: 1,
      botCount: Math.max(1, input.seats.length - 1),
      startingStack: 1000,
      smallBlind,
      bigBlind,
      ante: 0,
      isTournament: false,
      botDifficulty: 'easy',
    },
    blinds: { smallBlind: toChips(smallBlind), bigBlind: toChips(bigBlind), ante: toChips(0) },
    dealerIndex: input.dealerIndex ?? 0,
    heroId,
    players: input.seats.map((seat, i) => ({
      id: toPlayerId(seat.id),
      seat: i,
      botDifficulty: seat.id === heroId ? null : 'easy',
      startingStack: toChips(seat.stack ?? 1000),
      endingStack: toChips(seat.end ?? seat.stack ?? 1000),
      holeCards: cards(seat.cards),
    })),
    board,
    undealtCards: [],
    events: input.events,
  };
}

const id = (value: string): PlayerId => toPlayerId(value);

export const post = (
  player: string,
  amount: number,
  kind: 'smallBlind' | 'bigBlind' | 'ante',
): EngineEvent => ({ type: 'blindsPosted', playerId: id(player), amount: toChips(amount), kind });

export const act = (player: string, action: ActionInput): EngineEvent => ({
  type: 'actionTaken',
  playerId: id(player),
  action,
});

export const fold = (player: string): EngineEvent => act(player, { kind: 'fold' });
export const check = (player: string): EngineEvent => act(player, { kind: 'check' });
export const call = (player: string): EngineEvent => act(player, { kind: 'call' });
export const bet = (player: string, total: number): EngineEvent =>
  act(player, { kind: 'bet', amount: toChips(total) });
export const raise = (player: string, total: number): EngineEvent =>
  act(player, { kind: 'raise', amount: toChips(total) });

export const street = (name: 'flop' | 'turn' | 'river' | 'showdown', dealt = ''): EngineEvent => ({
  type: 'streetAdvanced',
  street: name,
  communityCards: cards(dealt),
});
