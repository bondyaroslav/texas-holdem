import type { Card, Rank, Rng, Suit } from './types.js';

const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];
const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];

export type Deck = readonly Card[];

export function createDeck(): Deck {
  const deck: Card[] = [];
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit });
    }
  }
  return deck;
}

/** Fisher–Yates on an injected {@link Rng} — same seed always yields the same order. */
export function shuffleDeck(deck: Deck, rng: Rng): Deck {
  const shuffled = [...deck];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng.next() * (i + 1));
    const a = shuffled[i];
    const b = shuffled[j];
    if (a === undefined || b === undefined) {
      throw new RangeError('Shuffle index out of bounds');
    }
    shuffled[i] = b;
    shuffled[j] = a;
  }
  return shuffled;
}

export function drawCard(deck: Deck): { readonly card: Card; readonly remaining: Deck } {
  const [card, ...remaining] = deck;
  if (!card) {
    throw new RangeError('Cannot draw from an empty deck');
  }
  return { card, remaining };
}
