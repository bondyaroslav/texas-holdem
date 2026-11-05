import { describe, expect, it } from 'vitest';
import type { Card, Rank, Suit } from '@poker/engine';
import { ALL_HAND_CLASSES, combosOfClass, handClassOf } from './hand-class.js';
import { openFrequency, openingRange } from './preflop-ranges.js';
import { positionOf } from './positions.js';
import { preflopPercentile, preflopRangeBetween, topPreflopRange } from './preflop-strength.js';

const SUITS: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
function suitOf(char: string | undefined): Suit {
  const suit = SUITS[char ?? ''];
  if (!suit) throw new Error(`Unknown suit: ${String(char)}`);
  return suit;
}
const card = (t: string): Card => ({ rank: t[0] as Rank, suit: suitOf(t[1]) });
const pair = (a: string, b: string): [Card, Card] => [card(a), card(b)];
const size = (range: readonly { weight?: number }[]): number =>
  range.reduce((sum, c) => sum + (c.weight ?? 1), 0);

describe('hand classes', () => {
  it('has the 169 starting-hand classes covering all 1326 combos', () => {
    expect(ALL_HAND_CLASSES).toHaveLength(169);
    expect(new Set(ALL_HAND_CLASSES).size).toBe(169);
    expect(ALL_HAND_CLASSES.reduce((sum, c) => sum + combosOfClass(c).length, 0)).toBe(1326);
  });

  it('names a holding regardless of card order', () => {
    expect(handClassOf(card('Ah'), card('Kh'))).toBe('AKs');
    expect(handClassOf(card('Kd'), card('Ah'))).toBe('AKo');
    expect(handClassOf(card('7c'), card('7s'))).toBe('77');
  });

  it('expands a class into 6 / 4 / 12 distinct combos of that class', () => {
    expect(combosOfClass('QQ')).toHaveLength(6);
    expect(combosOfClass('T9s')).toHaveLength(4);
    expect(combosOfClass('T9o')).toHaveLength(12);
    for (const [a, b] of combosOfClass('T9o')) {
      expect(handClassOf(a, b)).toBe('T9o');
    }
  });
});

describe('preflop strength', () => {
  it('ranks aces above kings above trash', () => {
    const aa = preflopPercentile(pair('As', 'Ah'));
    const kk = preflopPercentile(pair('Ks', 'Kh'));
    const trash = preflopPercentile(pair('7s', '2h'));
    expect(aa).toBeLessThan(kk);
    expect(kk).toBeLessThan(trash);
    expect(aa).toBeLessThan(0.01);
  });

  it('builds a range whose size tracks the requested fraction', () => {
    for (const fraction of [0.05, 0.14, 0.45, 1]) {
      expect(size(topPreflopRange(fraction)) / 1326).toBeCloseTo(fraction, 6);
    }
  });

  it('nests: a tighter range is contained in a looser one', () => {
    const loose = new Set(topPreflopRange(0.3).map((c) => JSON.stringify(c.cards)));
    for (const c of topPreflopRange(0.1)) {
      expect(loose.has(JSON.stringify(c.cards))).toBe(true);
    }
  });

  it('slices a band between two fractions', () => {
    expect(size(preflopRangeBetween(0.1, 0.3)) / 1326).toBeCloseTo(0.2, 6);
    expect(preflopRangeBetween(0.5, 0.5)).toEqual([]);
  });
});

describe('positions', () => {
  it.each([
    [2, ['btn', 'bb']],
    [3, ['btn', 'sb', 'bb']],
    [4, ['btn', 'sb', 'bb', 'co']],
    [5, ['btn', 'sb', 'bb', 'hj', 'co']],
    [6, ['btn', 'sb', 'bb', 'utg', 'hj', 'co']],
    [9, ['btn', 'sb', 'bb', 'utg', 'mp', 'mp', 'mp', 'hj', 'co']],
  ] as const)('names %i-handed seats', (count, expected) => {
    expect(Array.from({ length: count }, (_, i) => positionOf(i, count))).toEqual(expected);
  });

  it('rejects impossible seats', () => {
    expect(() => positionOf(2, 2)).toThrow(RangeError);
    expect(() => positionOf(-1, 6)).toThrow(RangeError);
    expect(() => positionOf(0, 1)).toThrow(RangeError);
  });
});

describe('opening ranges', () => {
  it('widen towards the button and widen heads-up', () => {
    expect(openFrequency('utg', 9)).toBeLessThan(openFrequency('co', 9));
    expect(openFrequency('co', 9)).toBeLessThan(openFrequency('btn', 9));
    expect(openFrequency('btn', 2)).toBeGreaterThan(openFrequency('btn', 9));
    expect(size(openingRange('utg', 9)) / 1326).toBeCloseTo(0.14, 6);
  });
});
