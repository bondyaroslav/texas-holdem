import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createMulberry32, toChips } from './index.js';

describe('createMulberry32', () => {
  it('is deterministic for a given seed', () => {
    const a = createMulberry32(42);
    const b = createMulberry32(42);

    const sequenceA = Array.from({ length: 10 }, () => a.next());
    const sequenceB = Array.from({ length: 10 }, () => b.next());

    expect(sequenceA).toEqual(sequenceB);
  });

  it('produces values in [0, 1)', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 2 ** 32 - 1 }), (seed) => {
        const rng = createMulberry32(seed);
        const value = rng.next();
        expect(value).toBeGreaterThanOrEqual(0);
        expect(value).toBeLessThan(1);
      }),
    );
  });
});

describe('toChips', () => {
  it('accepts non-negative integers', () => {
    expect(toChips(0)).toBe(0);
    expect(toChips(1500)).toBe(1500);
  });

  it('rejects negative or non-integer amounts', () => {
    expect(() => toChips(-1)).toThrow(RangeError);
    expect(() => toChips(1.5)).toThrow(RangeError);
  });
});
