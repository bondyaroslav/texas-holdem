import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  compareHandRanks,
  evaluateBestHand,
  evaluateFiveCards,
  type HandCategory,
} from './hand-rank.js';
import { createDeck, shuffleDeck } from './deck.js';
import { createMulberry32 } from './types.js';
import type { Card, Suit } from './types.js';

const SUIT_CHARS: Record<string, Suit> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

function parseCard(token: string): Card {
  const rank = token.slice(0, -1);
  const suitChar = token.slice(-1);
  const suit = SUIT_CHARS[suitChar];
  if (!suit) {
    throw new Error(`Unknown suit in card token "${token}"`);
  }
  return { rank: rank as Card['rank'], suit };
}

function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).map(parseCard);
}

describe('evaluateFiveCards — known cases per category', () => {
  const cases: {
    readonly name: string;
    readonly spec: string;
    readonly category: HandCategory;
    readonly tiebreakers: readonly number[];
  }[] = [
    {
      name: 'high card',
      spec: '2H 5S 9D JC AC',
      category: 'highCard',
      tiebreakers: [14, 11, 9, 5, 2],
    },
    { name: 'pair', spec: '2H 2S 9D JC AC', category: 'pair', tiebreakers: [2, 14, 11, 9] },
    { name: 'two pair', spec: '2H 2S 9D 9C AC', category: 'twoPair', tiebreakers: [9, 2, 14] },
    {
      name: 'three of a kind',
      spec: '2H 2S 2D 9C AC',
      category: 'threeOfAKind',
      tiebreakers: [2, 14, 9],
    },
    { name: 'straight', spec: '5H 6S 7D 8C 9C', category: 'straight', tiebreakers: [9] },
    {
      name: 'wheel straight (A-2-3-4-5)',
      spec: 'AH 2S 3D 4C 5C',
      category: 'straight',
      tiebreakers: [5],
    },
    { name: 'flush', spec: '2H 5H 9H JH AH', category: 'flush', tiebreakers: [14, 11, 9, 5, 2] },
    { name: 'full house', spec: '2H 2S 2D 9C 9H', category: 'fullHouse', tiebreakers: [2, 9] },
    {
      name: 'four of a kind',
      spec: '2H 2S 2D 2C 9H',
      category: 'fourOfAKind',
      tiebreakers: [2, 9],
    },
    { name: 'straight flush', spec: '5H 6H 7H 8H 9H', category: 'straightFlush', tiebreakers: [9] },
    { name: 'royal flush', spec: 'TH JH QH KH AH', category: 'straightFlush', tiebreakers: [14] },
  ];

  it.each(cases)('$name', ({ spec, category, tiebreakers }) => {
    const rank = evaluateFiveCards(cards(spec));
    expect(rank.category).toBe(category);
    expect(rank.tiebreakers).toEqual(tiebreakers);
  });

  it('throws unless given exactly 5 cards', () => {
    expect(() => evaluateFiveCards(cards('2H 3H 4H 5H'))).toThrow(RangeError);
    expect(() => evaluateFiveCards(cards('2H 3H 4H 5H 6H 7H'))).toThrow(RangeError);
  });
});

describe('evaluateFiveCards — category ordering', () => {
  const byCategory: Record<HandCategory, string> = {
    highCard: '2H 5S 9D JC AC',
    pair: '2H 2S 9D JC AC',
    twoPair: '2H 2S 9D 9C AC',
    threeOfAKind: '2H 2S 2D 9C AC',
    straight: '5H 6S 7D 8C 9C',
    flush: '2H 5H 9H JH AH',
    fullHouse: '2H 2S 2D 9C 9H',
    fourOfAKind: 'AH AS AD AC KH',
    straightFlush: '5H 6H 7H 8H 9H',
  };
  const order: HandCategory[] = [
    'highCard',
    'pair',
    'twoPair',
    'threeOfAKind',
    'straight',
    'flush',
    'fullHouse',
    'fourOfAKind',
    'straightFlush',
  ];

  it('ranks every category strictly higher than the one before it', () => {
    for (let i = 1; i < order.length; i++) {
      const weaker = order[i - 1];
      const stronger = order[i];
      if (!weaker || !stronger) continue;
      const weakerRank = evaluateFiveCards(cards(byCategory[weaker]));
      const strongerRank = evaluateFiveCards(cards(byCategory[stronger]));
      expect(compareHandRanks(strongerRank, weakerRank)).toBeGreaterThan(0);
    }
  });
});

describe('evaluateFiveCards — kicker tie-breaking', () => {
  it('breaks two-pair ties on the kicker', () => {
    const a = evaluateFiveCards(cards('2H 2S 9D 9C AC'));
    const b = evaluateFiveCards(cards('2H 2S 9D 9C KC'));
    expect(compareHandRanks(a, b)).toBeGreaterThan(0);
  });

  it('breaks full-house ties on the trips first, then the pair', () => {
    const higherTrips = evaluateFiveCards(cards('9H 9S 9D 2C 2H'));
    const lowerTrips = evaluateFiveCards(cards('8H 8S 8D KC KH'));
    expect(compareHandRanks(higherTrips, lowerTrips)).toBeGreaterThan(0);

    const higherPair = evaluateFiveCards(cards('9H 9S 9D KC KH'));
    const lowerPair = evaluateFiveCards(cards('9H 9S 9D 2C 2H'));
    expect(compareHandRanks(higherPair, lowerPair)).toBeGreaterThan(0);
  });

  it('breaks high-card ties down to the last kicker', () => {
    const a = evaluateFiveCards(cards('2H 5S 9D JC AC'));
    const b = evaluateFiveCards(cards('3H 5S 9D JC AC'));
    expect(compareHandRanks(b, a)).toBeGreaterThan(0);
  });

  it('ranks a higher straight above a lower one, wheel lowest', () => {
    const wheel = evaluateFiveCards(cards('AH 2S 3D 4C 5C'));
    const sixHigh = evaluateFiveCards(cards('2H 3S 4D 5C 6C'));
    const broadway = evaluateFiveCards(cards('TH JS QD KC AC'));
    expect(compareHandRanks(sixHigh, wheel)).toBeGreaterThan(0);
    expect(compareHandRanks(broadway, sixHigh)).toBeGreaterThan(0);
  });
});

describe('evaluateBestHand — best 5 of up to 7', () => {
  it('finds the full house among 7 cards, ignoring the two irrelevant kickers', () => {
    const sevenCards = cards('2H 2S 2D 9D 9C AC 4D');
    const best = evaluateBestHand(sevenCards);
    expect(best.category).toBe('fullHouse');
    expect(best.tiebreakers).toEqual([2, 9]);
  });

  it('picks a flush over a straight hidden in the same 7 cards', () => {
    // Hearts 2-4-6-8-T make the flush; 4H-5S-6H-7D-8H make a competing straight.
    const sevenCards = cards('2H 4H 6H 8H TH 5S 7D');
    const best = evaluateBestHand(sevenCards);
    expect(best.category).toBe('flush');
    expect(best.tiebreakers).toEqual([10, 8, 6, 4, 2]);
  });

  it('lets two different hole cards both "play the board" to a tie', () => {
    const board = cards('AH KH QH JH TH'); // broadway straight flush on the board
    const holeA = cards('2C 3D');
    const holeB = cards('4S 5C');
    const bestA = evaluateBestHand([...holeA, ...board]);
    const bestB = evaluateBestHand([...holeB, ...board]);
    expect(bestA.score).toBe(bestB.score);
    expect(bestA.category).toBe('straightFlush');
  });

  it('throws with fewer than 5 cards', () => {
    expect(() => evaluateBestHand(cards('2H 3H 4H'))).toThrow(RangeError);
  });

  it('is invariant under the order the cards are given', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (seed) => {
        const deck = shuffleDeck(createDeck(), createMulberry32(seed));
        const sevenCards = deck.slice(0, 7);
        const baseline = evaluateBestHand(sevenCards).score;

        const reshuffled = shuffleDeck(sevenCards, createMulberry32(seed + 1));
        expect(evaluateBestHand(reshuffled).score).toBe(baseline);
      }),
    );
  });
});
