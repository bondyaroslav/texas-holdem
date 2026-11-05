import { preflopPercentile } from './preflop-strength.js';
import type { HandRange, WeightedCombo } from './types.js';
import { evaluateScoreFast, type Card } from '@poker/engine';

/** 15^5: one hand category spans this many score values (see the engine's score encoding). */
const CATEGORY_SPAN = 759_375;
const HIGH_CARD = 1;

export interface RankedCombo {
  readonly combo: WeightedCombo;
  readonly weight: number;
  /** Position within the range by weight, 0 = strongest hand, →1 = weakest. Midpoint of the combo's slice. */
  readonly top: number;
  /** A drawing hand: four to a flush or a straight that is not already made (flop/turn only). */
  readonly draw: boolean;
}

function hasStraight(mask: number): boolean {
  const withLowAce = mask | ((mask >> 14) & 1 ? 1 << 1 : 0);
  for (let high = 14; high >= 5; high--) {
    if (((withLowAce >> (high - 4)) & 31) === 31) return true;
  }
  return false;
}

const RANK_ORDER = '23456789TJQKA';
const rankBit = (card: Card): number => 1 << (RANK_ORDER.indexOf(card.rank) + 2);

/** Flush or straight draw that the hole cards, not just the board, contribute to. */
export function hasDraw(hole: readonly [Card, Card], board: readonly Card[]): boolean {
  if (board.length < 3 || board.length >= 5) return false;

  for (const suit of ['clubs', 'diamonds', 'hearts', 'spades'] as const) {
    const total =
      board.filter((c) => c.suit === suit).length + hole.filter((c) => c.suit === suit).length;
    if (total === 4 && hole.some((c) => c.suit === suit)) return true;
  }

  const boardMask = board.reduce((mask, c) => mask | rankBit(c), 0);
  const mask = hole.reduce((m, c) => m | rankBit(c), boardMask);
  if (hasStraight(mask)) return false;
  for (let value = 2; value <= 14; value++) {
    const bit = 1 << value;
    if (mask & bit) continue;
    if (hasStraight(mask | bit) && !hasStraight(boardMask | bit)) return true;
  }
  return false;
}

/**
 * Sort key for how good a holding is on this board: made-hand category first,
 * then its tiebreakers; a drawing hand ranks half a category above the same
 * hand without the draw, so draws sit between air and a pair.
 */
function postflopKey(
  hole: readonly [Card, Card],
  board: readonly Card[],
): { key: number; draw: boolean } {
  const score = evaluateScoreFast([...hole, ...board]);
  const category = Math.floor(score / CATEGORY_SPAN);
  const draw = hasDraw(hole, board);
  const bonus = draw ? (category === HIGH_CARD ? 0.5 : 0.25) : 0;
  return { key: (category + bonus) * 1e7 + (score % CATEGORY_SPAN), draw };
}

/** Orders a range from strongest to weakest hand on `board` (preflop when it has no cards). */
export function rankRange(range: HandRange, board: readonly Card[]): readonly RankedCombo[] {
  const scored = range.map((combo) => {
    if (board.length < 3) {
      return { combo, key: -preflopPercentile(combo.cards), draw: false };
    }
    return { combo, ...postflopKey(combo.cards, board) };
  });
  scored.sort((a, b) => b.key - a.key);

  const total = scored.reduce((sum, s) => sum + (s.combo.weight ?? 1), 0);
  let before = 0;
  return scored.map(({ combo, draw }) => {
    const weight = combo.weight ?? 1;
    const top = total > 0 ? (before + weight / 2) / total : 0;
    before += weight;
    return { combo, weight, top, draw };
  });
}

/** The strongest `fraction` of a range by weight (boundary combos are kept whole; never returns an empty range). */
export function keepTopFraction(
  range: HandRange,
  board: readonly Card[],
  fraction: number,
): HandRange {
  if (fraction >= 1) return range;
  const ranked = rankRange(range, board);
  const kept = ranked.filter((r) => r.top < fraction);
  if (kept.length > 0) return kept.map((r) => r.combo);
  const strongest = ranked[0];
  return strongest ? [strongest.combo] : range;
}
