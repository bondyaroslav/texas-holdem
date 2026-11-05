export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export type Rank = '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | 'T' | 'J' | 'Q' | 'K' | 'A';

export interface Card {
  readonly rank: Rank;
  readonly suit: Suit;
}

declare const ChipsBrand: unique symbol;
/** Integer chip amount, the engine's only unit — never a float. */
export type Chips = number & { readonly [ChipsBrand]: 'Chips' };

export function toChips(value: number): Chips {
  if (!Number.isInteger(value) || value < 0) {
    throw new RangeError(`Chips must be a non-negative integer, got ${String(value)}`);
  }
  return value as Chips;
}

declare const PlayerIdBrand: unique symbol;
export type PlayerId = string & { readonly [PlayerIdBrand]: 'PlayerId' };

export function toPlayerId(value: string): PlayerId {
  return value as PlayerId;
}

/** Seeded PRNG injected into the engine — no direct Math.random() calls allowed. */
export interface Rng {
  next(): number;
}

/** mulberry32: small, fast, deterministic PRNG for a given 32-bit seed. */
export function createMulberry32(seed: number): Rng {
  let state = seed >>> 0;
  return {
    next(): number {
      state = (state + 0x6d2b79f5) >>> 0;
      let t = state;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    },
  };
}

export type Result<T, E> =
  { readonly ok: true; readonly value: T } | { readonly ok: false; readonly error: E };

export function ok<T, E = never>(value: T): Result<T, E> {
  return { ok: true, value };
}

export function err<E, T = never>(error: E): Result<T, E> {
  return { ok: false, error };
}

export function assertNever(value: never): never {
  throw new Error(`Unexpected value: ${JSON.stringify(value)}`);
}
