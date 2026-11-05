import type { Verdict } from '@poker/protocol';
import type { AnalysisConfig } from '../analysis-config.js';

export interface PotShare {
  /** Chips in this (side) pot. */
  readonly amount: number;
  /** Hero's share of it against the players eligible for it. */
  readonly equity: number;
}

/**
 * Expected chips gained from here on by putting `callChips` in, relative to
 * folding. Each side pot is valued against its own eligible opponents, so
 * short all-in stacks are handled exactly. Later betting rounds are not modelled.
 */
export function callEv(pots: readonly PotShare[], callChips: number): number {
  return pots.reduce((sum, pot) => sum + pot.equity * pot.amount, 0) - callChips;
}

/** Break-even equity for a call: the price of the call over the pot it can win. */
export function requiredEquity(callChips: number, contestablePot: number): number | null {
  if (callChips <= 0 || contestablePot <= 0) return null;
  return Math.min(1, callChips / contestablePot);
}

/** Chance an opponent folds to a bet of `extra` chips into `potAfter`, scaled from minimum defence frequency. */
export function foldProbability(potAfter: number, extra: number, scale: number): number {
  if (extra <= 0) return 0;
  const defence = potAfter / (potAfter + extra);
  return Math.min(0.95, Math.max(0, (1 - defence) * scale));
}

export interface RaiseEvInput {
  /** Chips in the pot before the hero acts. */
  readonly pot: number;
  /** Chips the hero puts in with this bet/raise. */
  readonly putIn: number;
  /** Chips each caller must add to match (the raise over the current bet). */
  readonly extra: number;
  /** Probability every opponent folds. */
  readonly everyoneFolds: number;
  /** Hero's equity against the part of the opposing ranges that continues. */
  readonly equityWhenCalled: number;
  /** Opponents expected to call when someone does. */
  readonly callers: number;
}

/**
 * Heuristic EV of a bet/raise: win the pot outright when everyone folds,
 * otherwise play it out for the called pot at `equityWhenCalled`. Always an
 * estimate — fold frequency comes from a model, not from the opponent.
 */
export function raiseEv(input: RaiseEvInput): number {
  const { pot, putIn, extra, everyoneFolds, equityWhenCalled, callers } = input;
  const calledPot = pot + putIn + callers * extra;
  const whenCalled = equityWhenCalled * calledPot - putIn;
  return everyoneFolds * pot + (1 - everyoneFolds) * whenCalled;
}

export function verdictFor(
  lossBb: number,
  chosenIsBest: boolean,
  thresholds: AnalysisConfig['verdictThresholdsBb'],
): Verdict {
  if (chosenIsBest) return 'best';
  if (lossBb <= thresholds.good) return 'good';
  if (lossBb <= thresholds.inaccuracy) return 'inaccuracy';
  if (lossBb <= thresholds.mistake) return 'mistake';
  return 'blunder';
}
