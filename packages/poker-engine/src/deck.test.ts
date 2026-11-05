import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createDeck, drawCard, shuffleDeck } from './deck.js';
import { createMulberry32 } from './types.js';

function cardKey(card: { rank: string; suit: string }): string {
  return `${card.rank}${card.suit}`;
}

describe('createDeck', () => {
  it('has 52 unique cards', () => {
    const deck = createDeck();
    expect(deck).toHaveLength(52);
    expect(new Set(deck.map(cardKey)).size).toBe(52);
  });
});

describe('shuffleDeck', () => {
  it('is deterministic for a given seed', () => {
    const deck = createDeck();
    const a = shuffleDeck(deck, createMulberry32(7));
    const b = shuffleDeck(deck, createMulberry32(7));
    expect(a).toEqual(b);
  });

  it('produces a different order for a different seed', () => {
    const deck = createDeck();
    const a = shuffleDeck(deck, createMulberry32(1));
    const b = shuffleDeck(deck, createMulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('is always a permutation of the input deck, regardless of seed', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (seed) => {
        const deck = createDeck();
        const shuffled = shuffleDeck(deck, createMulberry32(seed));
        expect(shuffled).toHaveLength(52);
        expect(new Set(shuffled.map(cardKey))).toEqual(new Set(deck.map(cardKey)));
      }),
    );
  });
});

describe('drawCard', () => {
  it('returns the top card and the rest of the deck', () => {
    const deck = createDeck();
    const { card, remaining } = drawCard(deck);
    expect(card).toEqual(deck[0]);
    expect(remaining).toHaveLength(51);
  });

  it('throws when the deck is empty', () => {
    expect(() => drawCard([])).toThrow(RangeError);
  });
});
