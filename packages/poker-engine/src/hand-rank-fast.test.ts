import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { createDeck, shuffleDeck } from './deck.js';
import { evaluateBestHand } from './hand-rank.js';
import { evaluateScoreFast } from './hand-rank-fast.js';
import { createMulberry32, type Card, type Suit } from './types.js';

const SUITS: Record<string, Suit> = { s: 'spades', h: 'hearts', d: 'diamonds', c: 'clubs' };
function suitOf(char: string | undefined): Suit {
  const suit = SUITS[char ?? ''];
  if (!suit) throw new Error(`Unknown suit: ${String(char)}`);
  return suit;
}
const cards = (spec: string): Card[] =>
  spec.split(' ').map((t) => ({ rank: t[0] as Card['rank'], suit: suitOf(t[1]) }));

describe('evaluateScoreFast', () => {
  it.each([
    ['royal flush', 'As Ks Qs Js Ts 2d 3c'],
    ['wheel straight flush', 'As 2s 3s 4s 5s Kd Kc'],
    ['quads with best kicker', '9s 9h 9d 9c Ah Kd 2c'],
    ['full house from two trips', 'Ks Kh Kd 3s 3h 3d 2c'],
    ['full house from trips + two pairs', 'Ks Kh Kd 5s 5h 3d 3c'],
    ['flush over straight', 'As 9s 7s 4s 2s 6d 5c'],
    ['six-card flush uses the top five', 'As Qs 9s 7s 4s 2s 3d'],
    ['wheel straight', 'As 2d 3h 4c 5s Kd 9c'],
    ['broadway straight', 'As Kd Qh Jc Ts 2d 2c'],
    ['trips with kickers', '7s 7h 7d Ac Kd 2c 3s'],
    ['three pairs: kicker from the third pair', 'As Ah Kd Kc 5s 5h 2d'],
    ['two pair', 'As Ah Kd Kc 9s 5h 2d'],
    ['one pair', 'As Ah Kd Qc 9s 5h 2d'],
    ['high card', 'As Kh Qd Jc 9s 5h 2d'],
  ])('matches the reference evaluator: %s', (_name, spec) => {
    const hand = cards(spec);
    expect(evaluateScoreFast(hand)).toBe(evaluateBestHand(hand).score);
  });

  it('matches the reference evaluator on random 5-, 6- and 7-card hands', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 31 }),
        fc.integer({ min: 5, max: 7 }),
        (seed, size) => {
          const hand = shuffleDeck(createDeck(), createMulberry32(seed)).slice(0, size);
          expect(evaluateScoreFast(hand)).toBe(evaluateBestHand(hand).score);
        },
      ),
      { numRuns: 3_000 },
    );
  });

  it('rejects fewer than five cards', () => {
    expect(() => evaluateScoreFast(cards('As Kd Qh Jc'))).toThrow(RangeError);
  });
});
