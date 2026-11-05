import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { computeSidePots, splitPotAmong } from './pots.js';
import { toChips, toPlayerId } from './types.js';
import type { PlayerStatus, SeatedPlayer } from './state.js';

function seat(id: string, committedTotal: number, status: PlayerStatus = 'active'): SeatedPlayer {
  return {
    id: toPlayerId(id),
    stack: toChips(0),
    holeCards: [],
    status,
    committedThisStreet: toChips(0),
    committedTotal: toChips(committedTotal),
  };
}

describe('computeSidePots', () => {
  it('returns a single pot when nobody is all-in for less', () => {
    const players = [seat('a', 30), seat('b', 30), seat('c', 30)];
    const pots = computeSidePots(players);
    expect(pots).toEqual([
      { amount: 90, eligiblePlayerIds: [toPlayerId('a'), toPlayerId('b'), toPlayerId('c')] },
    ]);
  });

  it('splits into a main pot and a side pot around a short all-in', () => {
    const players = [seat('a', 100, 'allIn'), seat('b', 300), seat('c', 300)];
    const pots = computeSidePots(players);
    expect(pots).toEqual([
      { amount: 300, eligiblePlayerIds: [toPlayerId('a'), toPlayerId('b'), toPlayerId('c')] },
      { amount: 400, eligiblePlayerIds: [toPlayerId('b'), toPlayerId('c')] },
    ]);
  });

  it('keeps a folded player money in the pot but excludes them from eligibility', () => {
    const players = [seat('a', 50, 'folded'), seat('b', 100), seat('c', 100)];
    const pots = computeSidePots(players);
    expect(pots).toEqual([
      { amount: 150, eligiblePlayerIds: [toPlayerId('b'), toPlayerId('c')] },
      { amount: 100, eligiblePlayerIds: [toPlayerId('b'), toPlayerId('c')] },
    ]);
  });

  it('handles three distinct all-in levels (double side pot)', () => {
    const players = [seat('a', 50, 'allIn'), seat('b', 150, 'allIn'), seat('c', 400)];
    const pots = computeSidePots(players);
    expect(pots).toEqual([
      { amount: 150, eligiblePlayerIds: [toPlayerId('a'), toPlayerId('b'), toPlayerId('c')] },
      { amount: 200, eligiblePlayerIds: [toPlayerId('b'), toPlayerId('c')] },
      { amount: 250, eligiblePlayerIds: [toPlayerId('c')] },
    ]);
  });

  it('returns no pots when nobody has contributed', () => {
    expect(computeSidePots([seat('a', 0), seat('b', 0)])).toEqual([]);
  });

  it('never gains or loses chips relative to total contributions', () => {
    fc.assert(
      fc.property(
        fc.array(fc.record({ amount: fc.integer({ min: 0, max: 1000 }), folded: fc.boolean() }), {
          minLength: 1,
          maxLength: 8,
        }),
        (contributions) => {
          const players = contributions.map((c, i) =>
            seat(`p${String(i)}`, c.amount, c.folded ? 'folded' : 'active'),
          );
          const pots = computeSidePots(players);
          const totalPots = pots.reduce((sum, p) => sum + p.amount, 0);
          const totalContributed = contributions.reduce((sum, c) => sum + c.amount, 0);
          expect(totalPots).toBe(totalContributed);
        },
      ),
    );
  });
});

describe('splitPotAmong', () => {
  it('splits evenly with no remainder', () => {
    const [a, b] = [toPlayerId('a'), toPlayerId('b')];
    const shares = splitPotAmong(toChips(100), [a, b]);
    expect(shares.get(a)).toBe(50);
    expect(shares.get(b)).toBe(50);
  });

  it('gives the odd chip(s) to the front of the winner list', () => {
    const [a, b, c] = [toPlayerId('a'), toPlayerId('b'), toPlayerId('c')];
    const shares = splitPotAmong(toChips(100), [a, b, c]);
    expect(shares.get(a)).toBe(34);
    expect(shares.get(b)).toBe(33);
    expect(shares.get(c)).toBe(33);
  });

  it('awards the full amount to a single winner', () => {
    const a = toPlayerId('a');
    const shares = splitPotAmong(toChips(77), [a]);
    expect(shares.get(a)).toBe(77);
  });

  it('throws when there are no winners', () => {
    expect(() => splitPotAmong(toChips(50), [])).toThrow(RangeError);
  });

  it('always distributes the exact amount, regardless of winner count', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 10_000 }),
        fc.integer({ min: 1, max: 9 }),
        (amount, winnerCount) => {
          const winners = Array.from({ length: winnerCount }, (_, i) =>
            toPlayerId(`p${String(i)}`),
          );
          const shares = splitPotAmong(toChips(amount), winners);
          const total = Array.from(shares.values()).reduce((sum, v) => sum + v, 0);
          expect(total).toBe(amount);
        },
      ),
    );
  });
});
