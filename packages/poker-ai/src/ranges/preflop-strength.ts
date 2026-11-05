import type { Card } from '@poker/engine';
import { preflopHandScore } from '../hand-strength.js';
import { ALL_HAND_CLASSES, combosOfClass, handClassOf, type HandClass } from './hand-class.js';
import type { HandRange, WeightedCombo } from './types.js';

const TOTAL_COMBOS = 1326;

interface RankedClass {
  readonly handClass: HandClass;
  readonly combos: number;
  /** Fraction of all combos that rank strictly better than this class. */
  readonly start: number;
  readonly end: number;
}

// Ordered by the same `preflopHandScore` the Easy bot uses, so ranges and bots
// agree on what "top 15% of hands" means. Ties fall back to the class label for
// a stable order.
const RANKED: readonly RankedClass[] = (() => {
  const scored = ALL_HAND_CLASSES.map((handClass) => {
    const sample = combosOfClass(handClass)[0];
    if (!sample) throw new Error(`No combos for ${handClass}`);
    return { handClass, combos: combosOfClass(handClass).length, score: preflopHandScore(sample) };
  }).sort((a, b) => b.score - a.score || a.handClass.localeCompare(b.handClass));

  let cumulative = 0;
  return scored.map(({ handClass, combos }) => {
    const start = cumulative / TOTAL_COMBOS;
    cumulative += combos;
    return { handClass, combos, start, end: cumulative / TOTAL_COMBOS };
  });
})();

const BY_CLASS = new Map(RANKED.map((entry) => [entry.handClass, entry] as const));

/**
 * Where a class sits in the strength order: 0 = the very best hand, 1 = the
 * very worst. The class's midpoint, so a pair of aces is ~0.002, not 0.
 */
export function preflopPercentile(cards: readonly [Card, Card]): number {
  const entry = BY_CLASS.get(handClassOf(cards[0], cards[1]));
  if (!entry) throw new RangeError('Unknown hand class');
  return (entry.start + entry.end) / 2;
}

/**
 * Combos whose class lies between the `from` and `to` strength fractions
 * (0 = best). A class straddling a boundary is included with the fraction of
 * it that falls inside, so range sizes track the requested percentage closely.
 */
export function preflopRangeBetween(from: number, to: number): HandRange {
  const range: WeightedCombo[] = [];
  for (const entry of RANKED) {
    const overlap = Math.min(entry.end, to) - Math.max(entry.start, from);
    if (overlap <= 0) continue;
    const weight = overlap / (entry.end - entry.start);
    for (const cards of combosOfClass(entry.handClass)) {
      range.push({ cards, weight });
    }
  }
  return range;
}

/** The strongest `fraction` (0–1) of starting hands. */
export function topPreflopRange(fraction: number): HandRange {
  return preflopRangeBetween(0, fraction);
}
