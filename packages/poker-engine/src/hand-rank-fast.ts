import type { Card, Suit } from './types.js';
import { rankValue } from './hand-rank.js';

const SUIT_INDEX: Readonly<Record<Suit, number>> = { clubs: 0, diamonds: 1, hearts: 2, spades: 3 };

// Scratch buffers reused across calls: evaluation is the hot loop of every
// equity simulation, and allocating per hand would dominate its cost.
const rankCounts = new Int8Array(15);
const suitMasks = new Int32Array(4);
const suitCounts = new Int8Array(4);

/** Same base-15 encoding as `makeHandRank`, so scores are interchangeable with `HandRank.score`. */
function encode(category: number, a: number, b = 0, c = 0, d = 0, e = 0): number {
  return ((((category * 15 + a) * 15 + b) * 15 + c) * 15 + d) * 15 + e;
}

/** High card of the best straight in a rank bitmask (bit n = rank n, ace also counts low), or 0. */
function straightHigh(mask: number): number {
  const withLowAce = mask | ((mask >> 14) & 1 ? 1 << 1 : 0);
  for (let high = 14; high >= 5; high--) {
    if (((withLowAce >> (high - 4)) & 31) === 31) {
      return high;
    }
  }
  return 0;
}

/** Highest ranks present in `mask`, skipping `skipA`/`skipB`, written into `out`. */
function topRanks(mask: number, skipA: number, skipB: number, out: number[], count: number): void {
  out.length = 0;
  for (let value = 14; value >= 2 && out.length < count; value--) {
    if ((mask >> value) & 1 && value !== skipA && value !== skipB) {
      out.push(value);
    }
  }
}

const scratch: number[] = [];

/**
 * Score of the best 5-card hand among 5–7 cards, equal to
 * `evaluateBestHand(cards).score` but computed with bit tricks instead of
 * trying every 5-card subset — roughly an order of magnitude faster.
 */
export function evaluateScoreFast(cards: readonly Card[]): number {
  if (cards.length < 5) {
    throw new RangeError(`evaluateScoreFast needs at least 5 cards, got ${String(cards.length)}`);
  }

  rankCounts.fill(0);
  suitMasks.fill(0);
  suitCounts.fill(0);
  let rankMask = 0;
  for (const card of cards) {
    const value = rankValue(card.rank);
    const suit = SUIT_INDEX[card.suit];
    rankCounts[value] = (rankCounts[value] ?? 0) + 1;
    suitMasks[suit] = (suitMasks[suit] ?? 0) | (1 << value);
    suitCounts[suit] = (suitCounts[suit] ?? 0) + 1;
    rankMask |= 1 << value;
  }

  let flushMask = 0;
  for (let suit = 0; suit < 4; suit++) {
    if ((suitCounts[suit] ?? 0) >= 5) {
      flushMask = suitMasks[suit] ?? 0;
    }
  }
  if (flushMask) {
    const high = straightHigh(flushMask);
    if (high) {
      return encode(9, high);
    }
  }

  let quad = 0;
  let trip1 = 0;
  let trip2 = 0;
  let pair1 = 0;
  let pair2 = 0;
  for (let value = 14; value >= 2; value--) {
    const count = rankCounts[value] ?? 0;
    if (count === 4) {
      quad = quad || value;
    } else if (count === 3) {
      if (trip1) trip2 = trip2 || value;
      else trip1 = value;
    } else if (count === 2) {
      if (pair1) pair2 = pair2 || value;
      else pair1 = value;
    }
  }

  if (quad) {
    topRanks(rankMask, quad, 0, scratch, 1);
    return encode(8, quad, scratch[0] ?? 0);
  }
  if (trip1 && (trip2 || pair1)) {
    return encode(7, trip1, Math.max(trip2, pair1));
  }
  if (flushMask) {
    topRanks(flushMask, 0, 0, scratch, 5);
    return encode(6, scratch[0] ?? 0, scratch[1], scratch[2], scratch[3], scratch[4]);
  }
  const straight = straightHigh(rankMask);
  if (straight) {
    return encode(5, straight);
  }
  if (trip1) {
    topRanks(rankMask, trip1, 0, scratch, 2);
    return encode(4, trip1, scratch[0] ?? 0, scratch[1]);
  }
  if (pair1 && pair2) {
    topRanks(rankMask, pair1, pair2, scratch, 1);
    return encode(3, pair1, pair2, scratch[0] ?? 0);
  }
  if (pair1) {
    topRanks(rankMask, pair1, 0, scratch, 3);
    return encode(2, pair1, scratch[0] ?? 0, scratch[1], scratch[2]);
  }
  topRanks(rankMask, 0, 0, scratch, 5);
  return encode(1, scratch[0] ?? 0, scratch[1], scratch[2], scratch[3], scratch[4]);
}
