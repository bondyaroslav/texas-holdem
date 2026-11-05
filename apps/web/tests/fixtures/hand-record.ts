import { toChips, toPlayerId } from '@poker/engine';
import type { HandRecord } from '@poker/protocol';

/** A small, valid heads-up record: the hero folds, the bot collects the blinds. */
export function makeHandRecord(overrides: Partial<HandRecord> = {}): HandRecord {
  const hero = toPlayerId('local-player');
  const bot = toPlayerId('bot-1');
  return {
    schemaVersion: 1,
    id: 'hand-1',
    tableId: 'local-table',
    handNumber: 1,
    seed: 1,
    startedAt: 1_000,
    endedAt: 2_000,
    config: {
      schemaVersion: 1,
      botCount: 1,
      startingStack: 1000,
      smallBlind: 5,
      bigBlind: 10,
      ante: 0,
      isTournament: false,
      botDifficulty: 'easy',
    },
    blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
    dealerIndex: 0,
    heroId: hero,
    players: [
      {
        id: hero,
        seat: 0,
        botDifficulty: null,
        startingStack: toChips(1000),
        endingStack: toChips(995),
        holeCards: [
          { rank: 'A', suit: 'hearts' },
          { rank: 'K', suit: 'hearts' },
        ],
      },
      {
        id: bot,
        seat: 1,
        botDifficulty: 'easy',
        startingStack: toChips(1000),
        endingStack: toChips(1005),
        holeCards: [
          { rank: 'Q', suit: 'spades' },
          { rank: 'Q', suit: 'diamonds' },
        ],
      },
    ],
    board: [],
    undealtCards: [],
    events: [
      { type: 'handStarted', handNumber: 1, dealerIndex: 0 },
      { type: 'actionTaken', playerId: hero, action: { kind: 'fold' } },
      { type: 'potAwarded', playerId: bot, amount: toChips(15) },
      { type: 'handEnded' },
    ],
    ...overrides,
  };
}
