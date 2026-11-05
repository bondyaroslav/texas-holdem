import { toChips, toPlayerId, type EngineEvent } from '@poker/engine';
import { handAnalysisSchema, handRecordSchema, type HandRecord } from '@poker/protocol';
import { describe, expect, it } from 'vitest';
import { ANALYSIS_VERSION, analyzeHand } from './analyze-hand.js';
import { cards } from './test-helpers.js';

const hero = toPlayerId('local-player');
const botA = toPlayerId('bot-1');
const botB = toPlayerId('bot-2');

function record(events: readonly EngineEvent[], board: string): HandRecord {
  return {
    schemaVersion: 1,
    id: 'hand-1',
    tableId: 'local-table',
    handNumber: 1,
    seed: 42,
    startedAt: 1_000,
    endedAt: 2_000,
    config: {
      schemaVersion: 1,
      botCount: 2,
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
        endingStack: toChips(1000),
        holeCards: cards('Ah Ad'),
      },
      {
        id: botA,
        seat: 1,
        botDifficulty: 'easy',
        startingStack: toChips(1000),
        endingStack: toChips(1000),
        holeCards: cards('Kh Kd'),
      },
      {
        id: botB,
        seat: 2,
        botDifficulty: 'easy',
        startingStack: toChips(1000),
        endingStack: toChips(1000),
        holeCards: cards('7c 2d'),
      },
    ],
    board: cards(board),
    undealtCards: [],
    events,
  };
}

const fold = (playerId: typeof hero): EngineEvent => ({
  type: 'actionTaken',
  playerId,
  action: { kind: 'fold' },
});
const street = (name: 'flop' | 'turn' | 'river' | 'showdown', dealt: string): EngineEvent => ({
  type: 'streetAdvanced',
  street: name,
  communityCards: cards(dealt),
});

const FULL_HAND: readonly EngineEvent[] = [
  fold(botB),
  street('flop', 'Ks 9c 4d'),
  street('turn', '2s'),
  street('river', '3h'),
  street('showdown', ''),
  { type: 'handEnded' },
];

const options = { computedAt: 5_000, equity: { iterations: 300 } };

describe('analyzeHand', () => {
  it('measures equity per street for the players still in, with folded cards dead', () => {
    const input = record(FULL_HAND, 'Ks 9c 4d 2s 3h');
    expect(handRecordSchema.safeParse(input).success).toBe(true);

    const analysis = analyzeHand(input, options);

    expect(analysis.equityByStreet.map((s) => s.street)).toEqual([
      'preflop',
      'flop',
      'turn',
      'river',
    ]);
    expect(analysis.equityByStreet.map((s) => s.players.length)).toEqual([3, 2, 2, 2]);
    expect(analysis.equityByStreet.map((s) => s.board.length)).toEqual([0, 3, 4, 5]);
    expect(analysis.equityByStreet.map((s) => s.method)).toEqual([
      'monteCarlo',
      'exact',
      'exact',
      'exact',
    ]);

    const river = analysis.equityByStreet[3];
    // Kings now have trips against aces' single pair.
    expect(river?.players.find((p) => p.playerId === hero)?.equity).toBe(0);
    expect(river?.players.find((p) => p.playerId === botA)?.equity).toBe(1);

    for (const s of analysis.equityByStreet) {
      expect(s.players.reduce((sum, p) => sum + p.equity, 0)).toBeCloseTo(1, 9);
    }
  });

  it('stops measuring once a single player is left', () => {
    const analysis = analyzeHand(
      record([fold(botB), fold(botA), { type: 'handEnded' }], ''),
      options,
    );

    expect(analysis.equityByStreet.map((s) => s.street)).toEqual(['preflop']);
    expect(analysis.equityByStreet[0]?.players.map((p) => p.playerId)).toEqual([hero, botA, botB]);
  });

  it('skips streets nobody reached and is reproducible', () => {
    const events = [
      street('flop', 'Ks 9c 4d'),
      fold(botA),
      fold(botB),
      { type: 'handEnded' } as const,
    ];
    const input = record(events, 'Ks 9c 4d');
    const first = analyzeHand(input, options);
    const second = analyzeHand(input, options);

    expect(first.equityByStreet.map((s) => s.street)).toEqual(['preflop', 'flop']);
    expect(second).toEqual(first);
  });

  it('stamps the analysis version and passes its own schema', () => {
    const analysis = analyzeHand(record(FULL_HAND, 'Ks 9c 4d 2s 3h'), options);

    expect(analysis.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(analysis.computedAt).toBe(5_000);
    expect(analysis.handId).toBe('hand-1');
    expect(handAnalysisSchema.safeParse(analysis).success).toBe(true);
  });
});
