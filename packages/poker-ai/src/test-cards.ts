import type { Card, Rank, Suit } from '@poker/engine';
import type { Combo } from './ranges/types.js';

const SUITS: Readonly<Record<string, Suit>> = {
  c: 'clubs',
  d: 'diamonds',
  h: 'hearts',
  s: 'spades',
};

/** Test notation: `c('Ah')` → ace of hearts. */
export function c(notation: string): Card {
  const rank = notation[0] as Rank | undefined;
  const suit = SUITS[notation[1] ?? ''];
  if (!rank || !suit) throw new Error(`Bad card notation: ${notation}`);
  return { rank, suit };
}

export function cards(notation: string): Card[] {
  return notation.split(' ').filter(Boolean).map(c);
}

/** `hand('Ah Kh')` → a two-card combo. */
export function hand(notation: string): Combo {
  const [a, b] = cards(notation);
  if (!a || !b) throw new Error(`Need two cards: ${notation}`);
  return [a, b];
}
