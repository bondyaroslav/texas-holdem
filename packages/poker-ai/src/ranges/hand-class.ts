import type { Card, Rank, Suit } from '@poker/engine';
import { rankValue } from '@poker/engine';
import type { Combo } from './types.js';

/** Starting-hand class: `AA` (pair), `AKs` (suited), `AKo` (offsuit), higher rank first. */
export type HandClass = string;

const RANKS_DESC: readonly Rank[] = [
  'A',
  'K',
  'Q',
  'J',
  'T',
  '9',
  '8',
  '7',
  '6',
  '5',
  '4',
  '3',
  '2',
];
const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

export const ALL_HAND_CLASSES: readonly HandClass[] = RANKS_DESC.flatMap((high, i) =>
  RANKS_DESC.slice(i).flatMap((low) =>
    high === low ? [`${high}${low}`] : [`${high}${low}s`, `${high}${low}o`],
  ),
);

export function handClassOf(a: Card, b: Card): HandClass {
  const [high, low] = rankValue(a.rank) >= rankValue(b.rank) ? [a, b] : [b, a];
  if (high.rank === low.rank) {
    return `${high.rank}${low.rank}`;
  }
  return `${high.rank}${low.rank}${high.suit === low.suit ? 's' : 'o'}`;
}

/** Every concrete combo of a class: 6 for a pair, 4 suited, 12 offsuit. */
export function combosOfClass(handClass: HandClass): readonly Combo[] {
  const high = handClass[0] as Rank;
  const low = handClass[1] as Rank;
  const kind = handClass[2];
  const combos: Combo[] = [];
  for (const [i, suitA] of SUITS.entries()) {
    for (const [j, suitB] of SUITS.entries()) {
      if (high === low) {
        if (i < j)
          combos.push([
            { rank: high, suit: suitA },
            { rank: low, suit: suitB },
          ]);
      } else if (kind === 's' ? i === j : i !== j) {
        combos.push([
          { rank: high, suit: suitA },
          { rank: low, suit: suitB },
        ]);
      }
    }
  }
  return combos;
}
