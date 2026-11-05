import { toChips, toPlayerId, type PlayerId } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_CONFIG } from '../analysis-config.js';
import type { ActionStep } from '../replay.js';
import { callEv, foldProbability, raiseEv, requiredEquity, verdictFor } from './ev.js';
import { buildHeroPots } from './hero-pots.js';

describe('EV formulas', () => {
  it.each([
    // pots, call, expected
    [[{ amount: 100, equity: 0.5 }], 25, 25],
    [[{ amount: 100, equity: 0.2 }], 25, -5],
    [
      [
        { amount: 150, equity: 0.5 },
        { amount: 40, equity: 0.25 },
      ],
      50,
      35,
    ],
    [[{ amount: 60, equity: 1 }], 0, 60],
  ])('callEv(%j, %i) = %d', (pots, chips, expected) => {
    expect(callEv(pots, chips)).toBeCloseTo(expected, 10);
  });

  it('prices a call', () => {
    expect(requiredEquity(25, 100)).toBe(0.25);
    expect(requiredEquity(0, 100)).toBeNull();
    expect(requiredEquity(25, 0)).toBeNull();
  });

  it('derives fold frequency from minimum defence frequency', () => {
    expect(foldProbability(100, 50, 1)).toBeCloseTo(1 / 3, 10);
    expect(foldProbability(100, 50, 0.5)).toBeCloseTo(1 / 6, 10);
    expect(foldProbability(100, 0, 1)).toBe(0);
    expect(foldProbability(10, 10_000, 1)).toBe(0.95);
  });

  it('values a raise as fold equity plus the called pot', () => {
    // 0.5 × 100 + 0.5 × (0.4 × (100 + 50 + 50) − 50) = 50 + 15
    expect(
      raiseEv({
        pot: 100,
        putIn: 50,
        extra: 50,
        everyoneFolds: 0.5,
        equityWhenCalled: 0.4,
        callers: 1,
      }),
    ).toBeCloseTo(65, 10);
  });

  it.each([
    [0, true, 'best'],
    [0.2, false, 'good'],
    [0.3, false, 'good'],
    [1, false, 'inaccuracy'],
    [1.5, false, 'inaccuracy'],
    [3, false, 'mistake'],
    [5, false, 'mistake'],
    [5.01, false, 'blunder'],
  ] as const)('a loss of %f bb (best: %s) is %s', (loss, isBest, verdict) => {
    expect(verdictFor(loss, isBest, DEFAULT_ANALYSIS_CONFIG.verdictThresholdsBb)).toBe(verdict);
  });
});

function stepWith(committed: Record<string, number>, folded: string[] = []): ActionStep {
  const ids = Object.keys(committed).map(toPlayerId);
  return {
    eventIndex: 0,
    playerId: toPlayerId('hero'),
    action: { kind: 'call' },
    street: 'preflop',
    board: [],
    potBefore: Object.values(committed).reduce((a, b) => a + b, 0),
    toCall: 0,
    stackBefore: 0,
    currentBet: 0,
    minRaise: toChips(10),
    committedThisStreetBefore: 0,
    committed: new Map<PlayerId, number>(
      Object.entries(committed).map(([k, v]) => [toPlayerId(k), v]),
    ),
    stacks: new Map(ids.map((id) => [id, 0])),
    folded: new Set(folded.map(toPlayerId)),
    allIn: new Set(),
    raisesBefore: 0,
  };
}

describe('buildHeroPots', () => {
  it('splits into side pots, keeps dead money, and drops layers the hero cannot match', () => {
    // a is all-in for 50, b bet 100, c folded after putting in 10; the hero adds 50 to reach 70.
    const pots = buildHeroPots(
      stepWith({ hero: 20, a: 50, b: 100, c: 10 }, ['c']),
      toPlayerId('hero'),
      50,
    );

    expect(pots).toEqual([
      { amount: 40, opponents: ['a', 'b'] },
      { amount: 120, opponents: ['a', 'b'] },
      { amount: 40, opponents: ['b'] },
    ]);
  });

  it('gives the hero an uncontested pot when everyone else folded', () => {
    const pots = buildHeroPots(stepWith({ hero: 10, a: 5 }, ['a']), toPlayerId('hero'), 0);
    expect(pots).toEqual([
      { amount: 10, opponents: [] },
      { amount: 5, opponents: [] },
    ]);
  });
});
