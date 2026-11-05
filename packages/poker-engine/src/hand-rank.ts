import type { Card, Rank } from './types.js';

export type HandCategory =
  | 'highCard'
  | 'pair'
  | 'twoPair'
  | 'threeOfAKind'
  | 'straight'
  | 'flush'
  | 'fullHouse'
  | 'fourOfAKind'
  | 'straightFlush';

export interface HandRank {
  readonly category: HandCategory;
  /** Up to 5 ranks (2–14) that break ties within the category, strongest first. */
  readonly tiebreakers: readonly number[];
  /** Single comparable value: higher always beats lower, across any two hands. */
  readonly score: number;
}

/** Strength order of each category — higher always beats lower, 1–9. */
export const HAND_CATEGORY_ORDER: Readonly<Record<HandCategory, number>> = {
  highCard: 1,
  pair: 2,
  twoPair: 3,
  threeOfAKind: 4,
  straight: 5,
  flush: 6,
  fullHouse: 7,
  fourOfAKind: 8,
  straightFlush: 9,
};

const RANK_VALUES: Readonly<Record<Rank, number>> = {
  '2': 2,
  '3': 3,
  '4': 4,
  '5': 5,
  '6': 6,
  '7': 7,
  '8': 8,
  '9': 9,
  T: 10,
  J: 11,
  Q: 12,
  K: 13,
  A: 14,
};

export function rankValue(rank: Rank): number {
  return RANK_VALUES[rank];
}

/** Base-15 digit encoding (ranks are 0 or 2–14, all < 15) — strictly orders category then tiebreakers. */
function makeHandRank(category: HandCategory, tiebreakers: readonly number[]): HandRank {
  const padded = [...tiebreakers, 0, 0, 0, 0, 0].slice(0, 5);
  let score = HAND_CATEGORY_ORDER[category];
  for (const digit of padded) {
    score = score * 15 + digit;
  }
  return { category, tiebreakers, score };
}

export function compareHandRanks(a: HandRank, b: HandRank): number {
  return a.score - b.score;
}

function detectStraightHigh(values: readonly number[]): number | null {
  const unique = Array.from(new Set(values));
  if (unique.length !== 5) {
    return null;
  }
  const sorted = [...unique].sort((a, b) => a - b);
  const isWheel =
    sorted[0] === 2 && sorted[1] === 3 && sorted[2] === 4 && sorted[3] === 5 && sorted[4] === 14;
  if (isWheel) {
    return 5;
  }
  const isSequential = sorted.every((value, i) => i === 0 || value === (sorted[i - 1] ?? 0) + 1);
  return isSequential ? (sorted[sorted.length - 1] ?? null) : null;
}

/** Evaluates exactly 5 cards — the core of {@link evaluateBestHand}. */
export function evaluateFiveCards(cards: readonly Card[]): HandRank {
  if (cards.length !== 5) {
    throw new RangeError(`evaluateFiveCards expects exactly 5 cards, got ${String(cards.length)}`);
  }

  const values = cards.map((c) => rankValue(c.rank)).sort((a, b) => b - a);
  const isFlush = cards.every((c) => c.suit === cards[0]?.suit);
  const straightHigh = detectStraightHigh(values);

  const counts = new Map<number, number>();
  for (const value of values) {
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  const groups = Array.from(counts.entries()).sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const [first, second, third] = groups;

  if (straightHigh !== null && isFlush) {
    return makeHandRank('straightFlush', [straightHigh]);
  }
  if (first?.[1] === 4) {
    const kicker = second?.[0] ?? 0;
    return makeHandRank('fourOfAKind', [first[0], kicker]);
  }
  if (first?.[1] === 3 && second?.[1] === 2) {
    return makeHandRank('fullHouse', [first[0], second[0]]);
  }
  if (isFlush) {
    return makeHandRank('flush', values);
  }
  if (straightHigh !== null) {
    return makeHandRank('straight', [straightHigh]);
  }
  if (first?.[1] === 3) {
    const kickers = [second?.[0], third?.[0]].filter((v): v is number => v !== undefined);
    return makeHandRank('threeOfAKind', [first[0], ...kickers]);
  }
  if (first?.[1] === 2 && second?.[1] === 2) {
    const kicker = third?.[0] ?? 0;
    return makeHandRank('twoPair', [first[0], second[0], kicker]);
  }
  if (first?.[1] === 2) {
    const kickers = groups
      .slice(1)
      .map(([value]) => value)
      .slice(0, 3);
    return makeHandRank('pair', [first[0], ...kickers]);
  }
  return makeHandRank('highCard', values);
}

function* combinations<T>(items: readonly T[], size: number): Generator<T[]> {
  if (size === 0) {
    yield [];
    return;
  }
  for (let i = 0; i <= items.length - size; i++) {
    const head = items[i];
    if (head === undefined) {
      continue;
    }
    for (const rest of combinations(items.slice(i + 1), size - 1)) {
      yield [head, ...rest];
    }
  }
}

/** Best possible 5-card hand out of 5–7 cards — tries every 5-card subset. */
export function evaluateBestHand(cards: readonly Card[]): HandRank {
  if (cards.length < 5) {
    throw new RangeError(`evaluateBestHand needs at least 5 cards, got ${String(cards.length)}`);
  }

  let best: HandRank | null = null;
  for (const combo of combinations(cards, 5)) {
    const rank = evaluateFiveCards(combo);
    if (!best || rank.score > best.score) {
      best = rank;
    }
  }

  // Unreachable: combinations(cards, 5) always yields at least one combo when cards.length >= 5.
  if (!best) {
    throw new RangeError('No 5-card combination found');
  }
  return best;
}
