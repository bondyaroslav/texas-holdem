import fc from 'fast-check';
import { createDeck, createMulberry32, shuffleDeck } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { cards, hand } from '../test-cards.js';
import { createEquityCache } from './cache.js';
import { computeEquity } from './compute-equity.js';
import { countRunouts, exactEquity } from './exact.js';
import { monteCarloEquity } from './monte-carlo.js';
import type { EquityInput, EquityResult } from './types.js';

const heads = (a: string, b: string, board = ''): EquityInput => ({
  participants: [
    { kind: 'hand', cards: hand(a) },
    { kind: 'hand', cards: hand(b) },
  ],
  board: cards(board),
});

function equityOf(result: EquityResult, index: number): number {
  return result.participants[index]?.equity ?? Number.NaN;
}

describe('exact equity', () => {
  it('matches the outs count: nut flush draw + gutter-ish outs vs an overpair on the turn', () => {
    // Hero Ah5h on 9h 7h 2c 3d vs KsKd. Winning river cards (44 unseen):
    // 9 hearts (flush), 3 aces (pair of aces beats kings), 3 non-heart fours (wheel).
    const result = exactEquity(heads('Ah 5h', 'Ks Kd', '9h 7h 2c 3d'));

    expect(result.method).toBe('exact');
    expect(result.samples).toBe(44);
    expect(equityOf(result, 0)).toBeCloseTo(15 / 44, 10);
    expect(equityOf(result, 1)).toBeCloseTo(29 / 44, 10);
  });

  it('splits a chopped pot: both players play the same broadway straight', () => {
    const result = exactEquity(heads('Ah Kd', 'As Kc', 'Qh Jh Td 2c 3c'));

    expect(result.samples).toBe(1);
    expect(result.participants[0]).toEqual({ win: 0, tie: 1, equity: 0.5 });
    expect(result.participants[1]).toEqual({ win: 0, tie: 1, equity: 0.5 });
  });

  it('gives a made hand on the river 100% or 0%', () => {
    const result = exactEquity(heads('Ah Ad', 'Ks Kd', '2c 7d 9h Jc 3s'));
    expect(equityOf(result, 0)).toBe(1);
    expect(equityOf(result, 1)).toBe(0);
  });

  it('handles three players and dead cards', () => {
    const result = exactEquity({
      participants: [
        { kind: 'hand', cards: hand('Ah Ad') },
        { kind: 'hand', cards: hand('Ks Kd') },
        { kind: 'hand', cards: hand('Qs Qd') },
      ],
      board: cards('2c 7d 9h 3s'),
      dead: cards('Kh Kc'),
    });
    // 52 - 6 hole - 4 board - 2 dead = 40 possible rivers.
    expect(result.samples).toBe(40);
    const total = result.participants.reduce((sum, p) => sum + p.equity, 0);
    expect(total).toBeCloseTo(1, 10);
  });

  it('counts run-outs from the unseen cards', () => {
    expect(countRunouts(heads('Ah Ad', 'Ks Kd'))).toBe(1_712_304); // C(48, 5)
    expect(countRunouts(heads('Ah Ad', 'Ks Kd', '2c 7d 9h'))).toBe(990); // C(45, 2)
    expect(countRunouts(heads('Ah Ad', 'Ks Kd', '2c 7d 9h 3s'))).toBe(44);
  });

  it('refuses ranges', () => {
    expect(() =>
      exactEquity({
        participants: [
          { kind: 'hand', cards: hand('Ah Ad') },
          { kind: 'range', combos: [{ cards: hand('Ks Kd') }] },
        ],
        board: cards('2c 7d 9h 3s'),
      }),
    ).toThrow(RangeError);
  });
});

describe('Monte Carlo equity', () => {
  it('lands near the published AA vs KK preflop figure (~82%)', () => {
    const result = monteCarloEquity(heads('Ac Ad', 'Kh Ks'), { iterations: 20_000, seed: 1 });

    expect(result.method).toBe('monteCarlo');
    expect(result.samples).toBe(20_000);
    expect(equityOf(result, 0)).toBeGreaterThan(0.805);
    expect(equityOf(result, 0)).toBeLessThan(0.835);
  });

  it('lands near the published AKs vs QQ preflop figure (~46%)', () => {
    const result = monteCarloEquity(heads('Ah Kh', 'Qs Qd'), { iterations: 20_000, seed: 2 });

    expect(equityOf(result, 0)).toBeGreaterThan(0.44);
    expect(equityOf(result, 0)).toBeLessThan(0.48);
  });

  it('agrees with exact enumeration within sampling error (flush draw vs top pair on the flop)', () => {
    const input = heads('Ah 5h', 'Ks Qd', '9h 7h Kc');
    const exact = exactEquity(input);
    const sampled = monteCarloEquity(input, { iterations: 20_000, seed: 3 });

    expect(Math.abs(equityOf(sampled, 0) - equityOf(exact, 0))).toBeLessThan(0.015);
  });

  it('is deterministic for a seed and varies across seeds', () => {
    const input = heads('Ah Kh', 'Qs Qd');
    const a = monteCarloEquity(input, { iterations: 500, seed: 7 });
    const b = monteCarloEquity(input, { iterations: 500, seed: 7 });
    const other = monteCarloEquity(input, { iterations: 500, seed: 8 });

    expect(b).toEqual(a);
    expect(other).not.toEqual(a);
  });

  it('weights a range: a combo with weight 0 is never dealt', () => {
    const input: EquityInput = {
      participants: [
        { kind: 'hand', cards: hand('Ah Ad') },
        {
          kind: 'range',
          combos: [{ cards: hand('Kh Ks') }, { cards: hand('2c 2d'), weight: 0 }],
        },
      ],
      board: cards('9c 7d 3s'),
    };
    const vsRange = monteCarloEquity(input, { iterations: 2_000, seed: 4 });
    const vsHand = exactEquity(heads('Ah Ad', 'Kh Ks', '9c 7d 3s'));

    expect(Math.abs(equityOf(vsRange, 0) - equityOf(vsHand, 0))).toBeLessThan(0.03);
  });

  it('skips range combos blocked by known cards', () => {
    // KsKc is blocked by the hero's Ks; only QhQd can be dealt.
    const result = monteCarloEquity(
      {
        participants: [
          { kind: 'hand', cards: hand('Ks Kd') },
          { kind: 'range', combos: [{ cards: hand('Ks Kc') }, { cards: hand('Qh Qd') }] },
        ],
        board: [],
      },
      { iterations: 5_000, seed: 5 },
    );

    expect(equityOf(result, 0)).toBeGreaterThan(0.78);
    expect(equityOf(result, 0)).toBeLessThan(0.84);
  });

  it('throws when every combo of a range is blocked', () => {
    expect(() =>
      monteCarloEquity({
        participants: [
          { kind: 'hand', cards: hand('Ks Kd') },
          { kind: 'range', combos: [{ cards: hand('Ks Kc') }] },
        ],
        board: [],
      }),
    ).toThrow(RangeError);
  });

  it('stops early when the time budget runs out', () => {
    let clock = 0;
    const result = monteCarloEquity(heads('Ah Kh', 'Qs Qd'), {
      iterations: 100_000,
      seed: 1,
      maxTimeMs: 10,
      now: () => (clock += 6),
    });

    expect(result.samples).toBeGreaterThan(0);
    expect(result.samples).toBeLessThan(100_000);
  });

  it('rejects a non-positive iteration count', () => {
    expect(() => monteCarloEquity(heads('Ah Kh', 'Qs Qd'), { iterations: 0 })).toThrow(RangeError);
  });
});

describe('computeEquity', () => {
  it('enumerates small spaces and samples large ones', () => {
    expect(computeEquity(heads('Ah Ad', 'Ks Kd', '2c 7d 9h')).method).toBe('exact');
    expect(computeEquity(heads('Ah Ad', 'Ks Kd'), { iterations: 200 }).method).toBe('monteCarlo');
  });

  it('honours an explicit mode', () => {
    const sampled = computeEquity(heads('Ah Ad', 'Ks Kd', '2c 7d 9h'), {
      mode: 'monteCarlo',
      iterations: 100,
    });
    expect(sampled.method).toBe('monteCarlo');
    expect(() =>
      computeEquity(
        {
          participants: [
            { kind: 'hand', cards: hand('Ah Ad') },
            { kind: 'range', combos: [{ cards: hand('Ks Kd') }] },
          ],
          board: [],
        },
        { mode: 'exact' },
      ),
    ).toThrow(RangeError);
  });

  it('validates its input', () => {
    expect(() => computeEquity({ participants: [], board: [] })).toThrow('at least two');
    expect(() => computeEquity(heads('Ah Ad', 'Ks Kd', '2c 7d'))).toThrow('Board must have');
    expect(() => computeEquity(heads('Ah Ad', 'Ah Kd'))).toThrow('Duplicate card');
    expect(() =>
      computeEquity({
        participants: [
          { kind: 'hand', cards: hand('Ah Ad') },
          { kind: 'range', combos: [] },
        ],
        board: [],
      }),
    ).toThrow('at least one combo');
  });

  it('caches results, ignoring the order of cards within a hand or board', () => {
    const cache = createEquityCache();
    const first = computeEquity(heads('Ah 5h', 'Ks Kd', '9h 7h 2c'), { cache });
    const second = computeEquity(heads('5h Ah', 'Kd Ks', '2c 9h 7h'), { cache });

    expect(second).toBe(first);
  });

  it('keys the cache on participant order, sampling parameters and dead cards', () => {
    const cache = createEquityCache();
    const input = heads('Ah Ad', 'Ks Kd');
    const a = computeEquity(input, { cache, iterations: 100, seed: 1 });

    expect(computeEquity(input, { cache, iterations: 100, seed: 2 })).not.toBe(a);
    expect(computeEquity(input, { cache, iterations: 200, seed: 1 })).not.toBe(a);
    expect(
      computeEquity({ ...input, dead: cards('2c') }, { cache, iterations: 100, seed: 1 }),
    ).not.toBe(a);
    expect(computeEquity(heads('Ks Kd', 'Ah Ad'), { cache, iterations: 100, seed: 1 })).not.toBe(a);
    expect(computeEquity(input, { cache, iterations: 100, seed: 1 })).toBe(a);
  });

  it('keys ranges by content', () => {
    const cache = createEquityCache();
    const withRange = (weight: number): EquityInput => ({
      participants: [
        { kind: 'hand', cards: hand('Ah Ad') },
        { kind: 'range', combos: [{ cards: hand('Ks Kd'), weight }, { cards: hand('Qs Qd') }] },
      ],
      board: [],
    });
    const a = computeEquity(withRange(1), { cache, iterations: 100 });

    expect(computeEquity(withRange(1), { cache, iterations: 100 })).toBe(a);
    expect(computeEquity(withRange(2), { cache, iterations: 100 })).not.toBe(a);
  });

  it('never caches a time-limited Monte Carlo run', () => {
    const cache = createEquityCache();
    const options = { cache, iterations: 100, maxTimeMs: 1_000, now: () => 0 };
    const a = computeEquity(heads('Ah Ad', 'Ks Kd'), options);
    const b = computeEquity(heads('Ah Ad', 'Ks Kd'), options);

    expect(b).not.toBe(a);
  });

  it('evicts the least recently used entry', () => {
    const cache = createEquityCache(2);
    const board = '2c 7d 9h 3s';
    const opts = { cache };
    const a = computeEquity(heads('Ah Ad', 'Ks Kd', board), opts);
    computeEquity(heads('Ah Ac', 'Ks Kd', board), opts);
    computeEquity(heads('Ah Ad', 'Ks Kd', board), opts); // refresh `a`
    computeEquity(heads('As Ac', 'Qs Qd', board), opts); // evicts the middle entry

    expect(computeEquity(heads('Ah Ad', 'Ks Kd', board), opts)).toBe(a);
    expect(cache.get('missing')).toBeUndefined();
  });
});

describe('equity properties', () => {
  it('shares always sum to 1, wins never exceed equity, on any exact deal', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.integer({ min: 2, max: 5 }),
        (seed, n) => {
          const deck = shuffleDeck(createDeck(), createMulberry32(seed));
          const participants = Array.from({ length: n }, (_, i) => {
            const a = deck[i * 2];
            const b = deck[i * 2 + 1];
            if (!a || !b) throw new Error('deck exhausted');
            return { kind: 'hand' as const, cards: [a, b] as const };
          });
          const board = deck.slice(n * 2, n * 2 + 4); // turn: 44-ish exact rivers
          const result = computeEquity({ participants, board });

          const total = result.participants.reduce((sum, p) => sum + p.equity, 0);
          expect(total).toBeCloseTo(1, 9);
          for (const p of result.participants) {
            expect(p.win).toBeLessThanOrEqual(p.equity + 1e-12);
            expect(p.equity).toBeLessThanOrEqual(p.win + p.tie + 1e-12);
          }
        },
      ),
      { numRuns: 25 },
    );
  });

  it('is independent of participant order', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 31 }), (seed) => {
        const deck = shuffleDeck(createDeck(), createMulberry32(seed));
        const [a1, a2, b1, b2] = deck;
        if (!a1 || !a2 || !b1 || !b2) throw new Error('deck exhausted');
        const board = deck.slice(4, 8);
        const ab = computeEquity({
          participants: [
            { kind: 'hand', cards: [a1, a2] },
            { kind: 'hand', cards: [b1, b2] },
          ],
          board,
        });
        const ba = computeEquity({
          participants: [
            { kind: 'hand', cards: [b1, b2] },
            { kind: 'hand', cards: [a1, a2] },
          ],
          board,
        });
        expect(equityOf(ab, 0)).toBeCloseTo(equityOf(ba, 1), 12);
      }),
      { numRuns: 25 },
    );
  });
});
