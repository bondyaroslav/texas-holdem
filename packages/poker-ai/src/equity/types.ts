import type { Card } from '@poker/engine';
import type { Combo, WeightedCombo } from '../ranges/types.js';

export type { Combo, WeightedCombo };

/** A player whose cards are known, or one we can only describe by a range of possible holdings. */
export type Participant =
  | { readonly kind: 'hand'; readonly cards: Combo }
  | { readonly kind: 'range'; readonly combos: readonly WeightedCombo[] };

export interface EquityInput {
  /** Index 0 is conventionally the hero; results come back in this order. */
  readonly participants: readonly Participant[];
  /** 0, 3, 4 or 5 community cards. */
  readonly board: readonly Card[];
  /** Cards known to be out of play (e.g. folded hands) that cannot appear on the board. */
  readonly dead?: readonly Card[];
}

export interface ParticipantEquity {
  /** Probability of winning outright. */
  readonly win: number;
  /** Probability of tying for the best hand. */
  readonly tie: number;
  /** win + tie split evenly among the tied players — the share of the pot expected. */
  readonly equity: number;
}

export interface EquityResult {
  readonly method: 'exact' | 'monteCarlo';
  /** Boards enumerated (exact) or iterations completed (Monte Carlo). */
  readonly samples: number;
  readonly participants: readonly ParticipantEquity[];
}

export interface EquityOptions {
  /** `auto` enumerates when the run-out count is within `exactLimit`, else samples. */
  readonly mode?: 'auto' | 'exact' | 'monteCarlo';
  /** Largest number of boards `auto` will enumerate. */
  readonly exactLimit?: number;
  readonly iterations?: number;
  /** Seeds Monte Carlo, so equal inputs give equal results. */
  readonly seed?: number;
  readonly cache?: EquityCache;
  /**
   * Wall-clock budget for Monte Carlo. Needs `now` (the package never reads the
   * clock itself); a time-limited run stops early, so it is neither deterministic
   * nor cached.
   */
  readonly maxTimeMs?: number;
  readonly now?: () => number;
}

export interface EquityCache {
  get(key: string): EquityResult | undefined;
  set(key: string, value: EquityResult): void;
}
