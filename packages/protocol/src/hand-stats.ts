import type { ExplanationMessage, Verdict } from './hand-analysis.js';

// Results of aggregate analysis. Computed locally today, served by the backend
// later — so they are part of the shared contract, not of the analysis package.

/** `count` out of `of`; `value` is null when there is nothing to divide by. */
export interface Rate {
  readonly count: number;
  readonly of: number;
  readonly value: number | null;
}

export interface HeroStats {
  readonly hands: number;
  readonly netChips: number;
  readonly netBb: number;
  /** Big blinds won per 100 hands. */
  readonly bbPer100: number | null;
  readonly vpip: Rate;
  readonly pfr: Rate;
  /** Postflop (bets + raises) / calls. */
  readonly aggression: {
    readonly aggressive: number;
    readonly calls: number;
    readonly factor: number | null;
  };
  /** Went to showdown, of the hands where the flop was seen. */
  readonly wtsd: Rate;
  /** Won money at showdown, of the showdowns. */
  readonly wsd: Rate;
  /** Hands where the hero was all in with cards to come: expected vs actual. */
  readonly allIn: {
    readonly hands: number;
    readonly expectedBb: number;
    readonly actualBb: number;
    /** actual − expected: positive means the cards ran better than the equity. */
    readonly luckBb: number;
  };
  readonly decisions: {
    readonly total: number;
    readonly byVerdict: Readonly<Record<Verdict, number>>;
    /** Share of decisions rated best or good. */
    readonly accuracy: number | null;
    readonly evLossBb: number;
  };
}

export type LeakId =
  | 'vpipTooHigh'
  | 'vpipTooLow'
  | 'callsTooMuchPreflop'
  | 'passivePostflop'
  | 'showdownTooOften'
  | 'openLimps'
  | 'overfolds'
  | 'callsWithoutOdds'
  | 'missesValue';

export type LeakSeverity = 'minor' | 'moderate' | 'major';

export interface Leak {
  readonly id: LeakId;
  readonly severity: LeakSeverity;
  /** `leak.<id>` plus the numbers behind it, for i18n. */
  readonly explanation: ExplanationMessage;
  /** Most recent hands showing the leak, newest first. */
  readonly handIds: readonly string[];
}
