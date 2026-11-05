import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { toChips, toPlayerId, type ActionInput } from '@poker/engine';
import type { Difficulty, PlayerView } from '../index.js';
import { decideBotAction } from '../decide.js';
import type { OpponentStats } from '../opponent-model.js';
import type { RangeStep } from '../ranges/narrow-range.js';
import { cards } from '../test-cards.js';
import { playTable } from '../test-table.js';
import { sampleView } from '../test-view.js';

const villain = toPlayerId('villain');

function decide(
  difficulty: Difficulty,
  view: PlayerView,
  seed = 1,
  extra: { opponentStats?: Record<string, OpponentStats>; isTournament?: boolean } = {},
): ActionInput {
  return decideBotAction({ view, difficulty, seed, ...extra });
}

function step(overrides: Partial<RangeStep>): RangeStep {
  return {
    eventIndex: 0,
    playerId: villain,
    action: { kind: 'check' },
    street: 'preflop',
    board: [],
    potBefore: 15,
    toCall: 10,
    committedThisStreetBefore: 0,
    raisesBefore: 0,
    ...overrides,
  };
}

/** Unopened pot, under the gun at a six-handed table. */
const utgUnopened = (hole: string): PlayerView =>
  sampleView({
    holeCards: cards(hole),
    position: 'utg',
    playersDealtIn: 6,
    potSize: toChips(15),
    currentBet: toChips(10),
    toCall: toChips(10),
  });

/** Flop, heads-up, villain bets `bet` into `pot` (pot already includes the bet). */
const facingFlopBet = (hole: string, board: string, pot: number, bet: number): PlayerView =>
  sampleView({
    holeCards: cards(hole),
    communityCards: cards(board),
    street: 'flop',
    potSize: toChips(pot),
    currentBet: toChips(bet),
    toCall: toChips(bet),
    history: [
      step({ playerId: toPlayerId('bot'), action: { kind: 'raise', amount: toChips(25) } }),
      step({ eventIndex: 1, action: { kind: 'call' }, raisesBefore: 1, toCall: 15 }),
      step({
        eventIndex: 2,
        street: 'flop',
        board: cards(board),
        action: { kind: 'bet', amount: toChips(bet) },
        potBefore: pot - bet,
        toCall: 0,
      }),
    ],
  });

describe.each(['medium', 'hard', 'expert'] as const)('%s — preflop', (level) => {
  it('opens aces and folds seven-deuce under the gun', () => {
    expect(decide(level, utgUnopened('Ah As')).kind).toBe('raise');
    expect(decide(level, utgUnopened('7h 2c'))).toEqual({ kind: 'fold' });
  });

  it('re-raises aces against an open', () => {
    const view = sampleView({
      holeCards: cards('Ah Ad'),
      position: 'btn',
      playersDealtIn: 6,
      potSize: toChips(40),
      currentBet: toChips(25),
      toCall: toChips(25),
      minRaise: toChips(15),
      history: [step({ action: { kind: 'raise', amount: toChips(25) } })],
    });
    expect(decide(level, view)).toEqual({ kind: 'raise', amount: 75 });
  });
});

describe('push or fold when short (hard, expert)', () => {
  it.each(['hard', 'expert'] as const)(
    '%s shoves aces and folds trash with 8 big blinds',
    (level) => {
      const short = (hole: string): PlayerView => ({ ...utgUnopened(hole), stack: toChips(80) });
      expect(decide(level, short('Ac Ad'))).toEqual({ kind: 'allIn' });
      expect(decide(level, short('8c 3d'))).toEqual({ kind: 'fold' });
    },
  );

  it('medium has no push/fold mode and just raises', () => {
    const view = { ...utgUnopened('Ac Ad'), stack: toChips(80) };
    expect(decide('medium', view).kind).toBe('raise');
  });
});

describe.each(['medium', 'hard', 'expert'] as const)('%s — postflop', (level) => {
  it('continues against a small bet with top pair and folds air to a pot-sized bet', () => {
    // Calling and raising are both fine with top pair, top kicker; folding is not.
    expect(['call', 'raise']).toContain(
      decide(level, facingFlopBet('Ah Qd', 'Qs 7c 2h', 70, 20)).kind,
    );
    expect(decide(level, facingFlopBet('5h 4d', 'Ks Qc 9h', 100, 50))).toEqual({ kind: 'fold' });
  });

  it('bets a set when checked to', () => {
    const view = sampleView({
      holeCards: cards('7h 7d'),
      communityCards: cards('7s Kc 2h'),
      street: 'flop',
      potSize: toChips(60),
      history: [step({ action: { kind: 'raise', amount: toChips(25) } })],
    });
    expect(decide(level, view).kind).toBe('bet');
  });
});

describe('expert', () => {
  const riverChecked = (seedHole: string): PlayerView =>
    sampleView({
      holeCards: cards(seedHole),
      communityCards: cards('Ks Qc 9h 4d 2s'),
      street: 'river',
      potSize: toChips(100),
      history: [
        step({ action: { kind: 'raise', amount: toChips(25) } }),
        step({
          eventIndex: 1,
          playerId: toPlayerId('bot'),
          action: { kind: 'call' },
          raisesBefore: 1,
        }),
      ],
    });
  const stats = (s: Partial<OpponentStats>): Record<string, OpponentStats> => ({
    [villain]: { hands: 100, vpip: 0.25, pfr: 0.15, af: 1.5, foldToCbet: 0.45, ...s },
  });
  const count = (fn: (seed: number) => boolean): number =>
    Array.from({ length: 300 }, (_, i) => fn(i + 1)).filter(Boolean).length;

  it('bluffs a calling station less than a player who folds a lot', () => {
    const bluffs = (opponent: Record<string, OpponentStats>): number =>
      count(
        (seed) =>
          decide('expert', riverChecked('6h 3c'), seed, { opponentStats: opponent }).kind === 'bet',
      );
    const vsStation = bluffs(stats({ vpip: 0.6, foldToCbet: 0.2 }));
    const vsFolder = bluffs(stats({ foldToCbet: 0.7 }));
    expect(vsFolder).toBeGreaterThan(vsStation);
  });

  it('calls a big all-in less often in a tournament (ICM)', () => {
    const view = { ...facingFlopBet('Ah Td', 'Ts 8c 4h', 400, 300), stack: toChips(300) };
    const calls = (isTournament: boolean): number =>
      count((seed) => decide('expert', view, seed, { isTournament }).kind !== 'fold');
    expect(calls(false)).toBeGreaterThan(calls(true));
  });
});

describe('every level', () => {
  it('gives the same answer for the same request', () => {
    const view = facingFlopBet('Jh Td', 'Qs 9c 2h', 70, 30);
    for (const level of ['medium', 'hard', 'expert'] as const) {
      expect(decide(level, view, 42)).toEqual(decide(level, view, 42));
    }
  });

  it('only ever takes legal actions, at any table mix (property)', () => {
    const level = fc.constantFrom<Difficulty>('beginner', 'easy', 'medium', 'hard', 'expert');
    fc.assert(
      fc.property(fc.array(level, { minLength: 2, maxLength: 9 }), fc.nat(), (levels, seed) => {
        // playTable throws on the first action the engine rejects.
        expect(playTable({ difficulties: levels, hands: 15, seed, stack: 300 }).hands).toBe(15);
      }),
      { numRuns: 25 },
    );
  });
});

describe('strength of the levels (heads-up, both seat orders, same cards)', () => {
  const edge = (strong: Difficulty, weak: Difficulty): number => {
    let total = 0;
    for (const seed of [1, 2]) {
      total += playTable({ difficulties: [strong, weak], hands: 150, seed }).net[0] ?? 0;
      total += playTable({ difficulties: [weak, strong], hands: 150, seed }).net[1] ?? 0;
    }
    return total;
  };

  it.each([
    ['hard', 'easy'],
    ['expert', 'easy'],
    ['medium', 'beginner'],
    ['hard', 'medium'],
  ] as const)('%s beats %s', (strong, weak) => {
    expect(edge(strong, weak)).toBeGreaterThan(0);
  });
});
