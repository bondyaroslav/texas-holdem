import { describe, expect, it } from 'vitest';
import { handAnalysisSchema } from './hand-analysis.js';
import { handRecordSchema } from './hand-record.js';

const ace = { rank: 'A', suit: 'hearts' } as const;
const king = { rank: 'K', suit: 'spades' } as const;

const validRecord = {
  schemaVersion: 1,
  id: 'h1',
  tableId: 't1',
  handNumber: 1,
  seed: 7,
  startedAt: 1,
  endedAt: 2,
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
  blinds: { smallBlind: 5, bigBlind: 10, ante: 0 },
  dealerIndex: 0,
  heroId: 'local-player',
  players: [
    {
      id: 'local-player',
      seat: 0,
      botDifficulty: null,
      startingStack: 1000,
      endingStack: 1010,
      holeCards: [ace, king],
    },
    {
      id: 'bot-1',
      seat: 1,
      botDifficulty: 'easy',
      startingStack: 1000,
      endingStack: 990,
      holeCards: [king, ace],
    },
  ],
  board: [],
  undealtCards: [],
  events: [
    { type: 'handStarted', handNumber: 1, dealerIndex: 0 },
    { type: 'actionTaken', playerId: 'bot-1', action: { kind: 'raise', amount: 30 } },
    { type: 'actionTaken', playerId: 'local-player', action: { kind: 'fold' } },
    { type: 'handEnded' },
  ],
};

describe('handRecordSchema', () => {
  it('accepts a complete record', () => {
    expect(handRecordSchema.safeParse(validRecord).success).toBe(true);
  });

  it('rejects an unknown schema version, bad cards and unknown events', () => {
    expect(handRecordSchema.safeParse({ ...validRecord, schemaVersion: 2 }).success).toBe(false);
    expect(
      handRecordSchema.safeParse({
        ...validRecord,
        board: [{ rank: '1', suit: 'hearts' }],
      }).success,
    ).toBe(false);
    expect(
      handRecordSchema.safeParse({ ...validRecord, events: [{ type: 'somethingElse' }] }).success,
    ).toBe(false);
  });

  it('rejects fractional chips and more than five board cards', () => {
    const fractional = {
      ...validRecord,
      events: [{ type: 'actionTaken', playerId: 'bot-1', action: { kind: 'bet', amount: 2.5 } }],
    };
    expect(handRecordSchema.safeParse(fractional).success).toBe(false);
    expect(handRecordSchema.safeParse({ ...validRecord, board: Array(6).fill(ace) }).success).toBe(
      false,
    );
  });
});

describe('handAnalysisSchema', () => {
  it('accepts a result and rejects out-of-range probabilities', () => {
    const analysis = {
      schemaVersion: 1,
      handId: 'h1',
      analysisVersion: 1,
      computedAt: 3,
      equityByStreet: [
        {
          street: 'preflop',
          board: [],
          method: 'exact',
          samples: 10,
          players: [{ playerId: 'local-player', win: 0.5, tie: 0, equity: 0.5 }],
        },
      ],
    };
    expect(handAnalysisSchema.safeParse(analysis).success).toBe(true);

    const broken = structuredClone(analysis);
    const player = broken.equityByStreet[0]?.players[0];
    if (player) player.equity = 1.5;
    expect(handAnalysisSchema.safeParse(broken).success).toBe(false);
  });
});
