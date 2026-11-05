import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { Card, Rank, Suit } from '@poker/engine';
import { preflopHandScore } from './hand-strength.js';

const RANKS: readonly Rank[] = ['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A'];
const SUITS: readonly Suit[] = ['clubs', 'diamonds', 'hearts', 'spades'];

function card(rank: Rank, suit: Suit): Card {
  return { rank, suit };
}

describe('preflopHandScore', () => {
  it('scores pocket aces as the maximum, 72o near the bottom', () => {
    const aa = preflopHandScore([card('A', 'spades'), card('A', 'hearts')]);
    const seven2off = preflopHandScore([card('7', 'spades'), card('2', 'hearts')]);
    expect(aa).toBe(100);
    expect(seven2off).toBeLessThan(aa);
    expect(seven2off).toBeLessThan(30);
  });

  it('ranks bigger pocket pairs above smaller ones', () => {
    const kk = preflopHandScore([card('K', 'spades'), card('K', 'hearts')]);
    const twos = preflopHandScore([card('2', 'spades'), card('2', 'hearts')]);
    expect(kk).toBeGreaterThan(twos);
  });

  it('rewards suitedness over the same ranks offsuit', () => {
    const suited = preflopHandScore([card('K', 'hearts'), card('9', 'hearts')]);
    const offsuit = preflopHandScore([card('K', 'hearts'), card('9', 'spades')]);
    expect(suited).toBeGreaterThan(offsuit);
  });

  it('rewards connected cards over a wide gap at the same high card', () => {
    const connected = preflopHandScore([card('J', 'spades'), card('T', 'hearts')]);
    const gapped = preflopHandScore([card('J', 'spades'), card('4', 'hearts')]);
    expect(connected).toBeGreaterThan(gapped);
  });

  it('throws unless given exactly 2 hole cards', () => {
    expect(() => preflopHandScore([card('A', 'spades')])).toThrow(RangeError);
    expect(() =>
      preflopHandScore([card('A', 'spades'), card('K', 'spades'), card('Q', 'spades')]),
    ).toThrow(RangeError);
  });

  it('always returns a score within [0, 100]', () => {
    fc.assert(
      fc.property(
        fc.constantFrom(...RANKS),
        fc.constantFrom(...SUITS),
        fc.constantFrom(...RANKS),
        fc.constantFrom(...SUITS),
        (rankA, suitA, rankB, suitB) => {
          fc.pre(!(rankA === rankB && suitA === suitB));
          const score = preflopHandScore([card(rankA, suitA), card(rankB, suitB)]);
          expect(score).toBeGreaterThanOrEqual(0);
          expect(score).toBeLessThanOrEqual(100);
        },
      ),
    );
  });
});
