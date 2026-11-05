import type { Card } from '@poker/engine';
import { rankValue } from '@poker/engine';

/**
 * Simple 0–100 preflop starting-hand score approximating classic opening
 * charts: average rank as a base, with bonuses for pairs, suitedness and
 * connectedness. Good enough for Easy's threshold-based rules (CLAUDE.md §5)
 * — not a substitute for real equity, which only Hard+ bots need.
 */
export function preflopHandScore(holeCards: readonly Card[]): number {
  const [a, b] = holeCards;
  if (holeCards.length !== 2 || !a || !b) {
    throw new RangeError(
      `preflopHandScore needs exactly 2 hole cards, got ${String(holeCards.length)}`,
    );
  }

  const valueA = rankValue(a.rank);
  const valueB = rankValue(b.rank);
  const high = Math.max(valueA, valueB);
  const low = Math.min(valueA, valueB);
  const suited = a.suit === b.suit;

  if (high === low) {
    // Pocket pair: 50 (22) up to 100 (AA).
    return 50 + ((high - 2) / 12) * 50;
  }

  const base = (((high + low) / 2 - 2) / 12) * 100;
  const suitedBonus = suited ? 8 : 0;
  const gap = high - low - 1;
  const connectedBonus = Math.max(0, 6 - gap * 2);

  return Math.min(100, base + suitedBonus + connectedBonus);
}
