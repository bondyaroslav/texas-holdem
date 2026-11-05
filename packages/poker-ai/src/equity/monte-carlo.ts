import { createMulberry32, type Card } from '@poker/engine';
import { DECK, cardAt, cardIndex, fixedCardIndexes } from './cards.js';
import { createTallies, scoreBoard } from './showdown.js';
import type { Combo, EquityInput, EquityResult, Participant } from './types.js';

export const DEFAULT_ITERATIONS = 20_000;
export const DEFAULT_SEED = 0x5eed;

/** How many iterations pass between clock reads — keeps `now()` off the hot path. */
const TIME_CHECK_INTERVAL = 256;

interface PreparedCombo {
  readonly cards: Combo;
  readonly indexes: readonly [number, number];
  readonly weight: number;
}

interface PreparedRange {
  readonly combos: readonly PreparedCombo[];
  readonly totalWeight: number;
}

function prepareRange(
  participant: Extract<Participant, { kind: 'range' }>,
  blocked: ReadonlySet<number>,
): PreparedRange {
  const combos: PreparedCombo[] = [];
  let totalWeight = 0;
  for (const { cards, weight = 1 } of participant.combos) {
    const indexes: [number, number] = [cardIndex(cards[0]), cardIndex(cards[1])];
    if (weight <= 0 || indexes[0] === indexes[1]) continue;
    if (blocked.has(indexes[0]) || blocked.has(indexes[1])) continue;
    combos.push({ cards, indexes, weight });
    totalWeight += weight;
  }
  if (combos.length === 0) {
    throw new RangeError('Every combo of a range is blocked by known cards');
  }
  return { combos, totalWeight };
}

function pickCombo(range: PreparedRange, roll: number): PreparedCombo {
  let target = roll * range.totalWeight;
  for (const combo of range.combos) {
    target -= combo.weight;
    if (target < 0) return combo;
  }
  // Float rounding can leave a sliver of `target`; the last combo owns it.
  const last = range.combos.at(-1);
  if (!last) throw new RangeError('Empty range');
  return last;
}

/**
 * Samples random run-outs (and range holdings). Ranges are drawn one after
 * another, re-rolling a combo that collides with cards already taken — a mild
 * approximation of the joint distribution, acceptable for equity estimates.
 */
export function monteCarloEquity(
  input: EquityInput,
  options: {
    readonly iterations?: number;
    readonly seed?: number;
    readonly maxTimeMs?: number;
    readonly now?: () => number;
  } = {},
): EquityResult {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  if (!Number.isInteger(iterations) || iterations < 1) {
    throw new RangeError(`iterations must be a positive integer, got ${String(iterations)}`);
  }
  const rng = createMulberry32(options.seed ?? DEFAULT_SEED);
  const deadline =
    options.maxTimeMs !== undefined && options.now ? options.now() + options.maxTimeMs : null;

  const fixed = fixedCardIndexes(input);
  const ranges = new Map<number, PreparedRange>();
  input.participants.forEach((p, i) => {
    if (p.kind === 'range') ranges.set(i, prepareRange(p, fixed));
  });

  const needed = 5 - input.board.length;
  const tallies = createTallies(input.participants.length);
  const freeCards: number[] = [];
  for (let i = 0; i < DECK.length; i++) {
    if (!fixed.has(i)) freeCards.push(i);
  }

  let samples = 0;
  for (let iteration = 0; iteration < iterations; iteration++) {
    if (deadline !== null && iteration % TIME_CHECK_INTERVAL === 0 && options.now) {
      if (iteration > 0 && options.now() >= deadline) break;
    }

    const taken = new Set<number>();
    const holes: Combo[] = [];
    let collided = false;
    for (let i = 0; i < input.participants.length; i++) {
      const participant = input.participants[i];
      const range = ranges.get(i);
      if (participant?.kind === 'hand') {
        holes.push(participant.cards);
      } else if (range) {
        let chosen: PreparedCombo | null = null;
        // A handful of re-rolls resolves nearly every collision between ranges.
        for (let attempt = 0; attempt < 20 && !chosen; attempt++) {
          const candidate = pickCombo(range, rng.next());
          if (!taken.has(candidate.indexes[0]) && !taken.has(candidate.indexes[1])) {
            chosen = candidate;
          }
        }
        if (!chosen) {
          collided = true;
          break;
        }
        taken.add(chosen.indexes[0]);
        taken.add(chosen.indexes[1]);
        holes.push(chosen.cards);
      }
    }
    if (collided) continue;

    // Partial Fisher–Yates over the cards still free after the ranges were dealt.
    const pool = freeCards.filter((index) => !taken.has(index));
    const drawn: Card[] = [];
    for (let k = 0; k < needed; k++) {
      const j = k + Math.floor(rng.next() * (pool.length - k));
      const a = pool[k];
      const b = pool[j];
      if (a === undefined || b === undefined) {
        throw new RangeError('Not enough cards left to complete the board');
      }
      pool[k] = b;
      pool[j] = a;
      drawn.push(cardAt(b));
    }

    scoreBoard(holes, [...input.board, ...drawn], tallies);
    samples++;
  }

  if (samples === 0) {
    throw new RangeError('No valid sample could be drawn — ranges collide with each other');
  }

  return {
    method: 'monteCarlo',
    samples,
    participants: tallies.map((t) => ({
      win: t.wins / samples,
      tie: t.ties / samples,
      equity: t.equity / samples,
    })),
  };
}
