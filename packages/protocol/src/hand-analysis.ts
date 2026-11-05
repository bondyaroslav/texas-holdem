import { z } from 'zod';
import type { Card, HandCategory, PlayerId } from '@poker/engine';
import { card, playerId } from './primitives.js';

export const VERDICTS = ['best', 'good', 'inaccuracy', 'mistake', 'blunder'] as const;
export type Verdict = (typeof VERDICTS)[number];

const alternative = z.object({
  kind: z.enum(['fold', 'check', 'call', 'bet', 'raise']),
  /** Total committed this street after a bet/raise; absent for the other kinds. */
  amount: z.number().int().nonnegative().optional(),
  /** Expected chips gained from here on, relative to folding (which is 0). */
  ev: z.number(),
  evBb: z.number(),
  /** True when `ev` rests on a fold-equity heuristic rather than a showdown calculation. */
  estimate: z.boolean(),
});

const explanation = z.object({
  /** i18n key; this package never produces user-facing text. */
  key: z.string().min(1),
  params: z.record(z.string(), z.union([z.string(), z.number()])),
});

export const decisionAnalysisSchema = z.object({
  /** Index into the record's `events` of the analysed `actionTaken`. */
  eventIndex: z.number().int().nonnegative(),
  street: z.enum(['preflop', 'flop', 'turn', 'river']),
  pot: z.number().int().nonnegative(),
  toCall: z.number().int().nonnegative(),
  action: z.object({
    kind: z.enum(['fold', 'check', 'call', 'bet', 'raise']),
    amount: z.number().int().nonnegative().optional(),
  }),
  /** Hero's share of the pot against the opponents' estimated ranges. */
  equity: z.number().min(0).max(1),
  /** Equity needed to break even on a call; null when there is nothing to call. */
  requiredEquity: z.number().min(0).max(1).nullable(),
  /** Additional view against the opponents' actual cards; null when it could not be computed. */
  knownCards: z.object({ equity: z.number().min(0).max(1), callEv: z.number() }).nullable(),
  alternatives: z.array(alternative).min(1),
  bestKind: z.enum(['fold', 'check', 'call', 'bet', 'raise']),
  evLossBb: z.number().nonnegative(),
  verdict: z.enum(VERDICTS),
  explanation,
});

const handCategory = z.enum([
  'highCard',
  'pair',
  'twoPair',
  'threeOfAKind',
  'straight',
  'flush',
  'fullHouse',
  'fourOfAKind',
  'straightFlush',
]);

export const handOutcomeSchema = z.object({
  /** The hand was decided by comparing cards, not by everyone else folding. */
  showdown: z.boolean(),
  players: z.array(
    z.object({
      playerId,
      /** Chips won or lost over the hand. */
      net: z.number().int(),
      /** Best five cards, strongest-relevant first; null when the player folded or no showdown happened. */
      bestHand: z
        .object({
          category: handCategory,
          cards: z.array(card).length(5),
          tiebreakers: z.array(z.number().int()),
        })
        .nullable(),
    }),
  ),
  pots: z.array(
    z.object({
      amount: z.number().int().nonnegative(),
      eligible: z.array(playerId),
      shares: z.array(z.object({ playerId, amount: z.number().int().nonnegative() })),
      /**
       * What separated the winner(s) from the best losing hand: the hand category,
       * the rank of the made hand, a kicker, or nothing (a split / an uncontested pot).
       */
      decidedBy: z.enum(['uncontested', 'category', 'rank', 'kicker', 'tie']),
      /** The winning kicker (2–14) when `decidedBy` is `kicker`. */
      kickerRank: z.number().int().min(2).max(14).nullable(),
    }),
  ),
  /** Set when the pot was won without a showdown. */
  foldWin: z
    .object({
      winnerId: playerId,
      street: z.enum(['preflop', 'flop', 'turn', 'river']),
      /** The last bet or raise the others folded to; null when they folded without facing one. */
      lastAggression: z.object({ playerId, amount: z.number().int().nonnegative() }).nullable(),
      foldedPlayerIds: z.array(playerId),
    })
    .nullable(),
  /** The hero's chips were all in with cards still to come: expected result vs what happened. */
  allIn: z
    .object({
      street: z.enum(['preflop', 'flop', 'turn']),
      heroEquity: z.number().min(0).max(1),
      expectedNet: z.number(),
      actualNet: z.number().int(),
    })
    .nullable(),
  explanations: z.array(explanation),
});

export const turningPointSchema = z.object({
  /**
   * `badBeat`: a clear favourite lost at showdown; `suckOut`: a clear underdog won;
   * `swing`: equity moved sharply from one street to the next.
   */
  kind: z.enum(['badBeat', 'suckOut', 'swing']),
  playerId,
  /** Street of the equity reading before the change. */
  street: z.enum(['preflop', 'flop', 'turn', 'river']),
  equityBefore: z.number().min(0).max(1),
  equityAfter: z.number().min(0).max(1),
});

export const handAnalysisSchema = z.object({
  schemaVersion: z.literal(1),
  handId: z.string().min(1),
  /** Bumped whenever the analysis logic changes, so stored results can be recomputed. */
  analysisVersion: z.number().int().positive(),
  computedAt: z.number().int().nonnegative(),
  decisions: z.array(decisionAnalysisSchema).default([]),
  outcome: handOutcomeSchema.nullable().default(null),
  turningPoints: z.array(turningPointSchema).default([]),
  equityByStreet: z.array(
    z.object({
      street: z.enum(['preflop', 'flop', 'turn', 'river']),
      board: z.array(card),
      method: z.enum(['exact', 'monteCarlo']),
      samples: z.number().int().positive(),
      /** Only players still in the hand at the start of the street, against their real cards. */
      players: z.array(
        z.object({
          playerId,
          win: z.number().min(0).max(1),
          tie: z.number().min(0).max(1),
          /** win + tie shared equally among the tied players. */
          equity: z.number().min(0).max(1),
        }),
      ),
    }),
  ),
});

export interface StreetEquity {
  readonly street: 'preflop' | 'flop' | 'turn' | 'river';
  readonly board: readonly Card[];
  readonly method: 'exact' | 'monteCarlo';
  readonly samples: number;
  readonly players: readonly {
    readonly playerId: PlayerId;
    readonly win: number;
    readonly tie: number;
    readonly equity: number;
  }[];
}

export type DecisionKind = 'fold' | 'check' | 'call' | 'bet' | 'raise';

export interface DecisionAlternative {
  readonly kind: DecisionKind;
  // `| undefined` matches what the Zod schema's `.optional()` produces under exactOptionalPropertyTypes.
  readonly amount?: number | undefined;
  readonly ev: number;
  readonly evBb: number;
  readonly estimate: boolean;
}

export interface ExplanationMessage {
  readonly key: string;
  readonly params: Readonly<Record<string, string | number>>;
}

export interface DecisionAnalysis {
  readonly eventIndex: number;
  readonly street: 'preflop' | 'flop' | 'turn' | 'river';
  readonly pot: number;
  readonly toCall: number;
  readonly action: { readonly kind: DecisionKind; readonly amount?: number | undefined };
  readonly equity: number;
  readonly requiredEquity: number | null;
  readonly knownCards: { readonly equity: number; readonly callEv: number } | null;
  readonly alternatives: readonly DecisionAlternative[];
  readonly bestKind: DecisionKind;
  readonly evLossBb: number;
  readonly verdict: Verdict;
  readonly explanation: ExplanationMessage;
}

export interface HandOutcomePot {
  readonly amount: number;
  readonly eligible: readonly PlayerId[];
  readonly shares: readonly { readonly playerId: PlayerId; readonly amount: number }[];
  readonly decidedBy: 'uncontested' | 'category' | 'rank' | 'kicker' | 'tie';
  readonly kickerRank: number | null;
}

export interface HandOutcomePlayer {
  readonly playerId: PlayerId;
  readonly net: number;
  readonly bestHand: {
    readonly category: HandCategory;
    readonly cards: readonly Card[];
    readonly tiebreakers: readonly number[];
  } | null;
}

export interface HandOutcome {
  readonly showdown: boolean;
  readonly players: readonly HandOutcomePlayer[];
  readonly pots: readonly HandOutcomePot[];
  readonly foldWin: {
    readonly winnerId: PlayerId;
    readonly street: 'preflop' | 'flop' | 'turn' | 'river';
    readonly lastAggression: { readonly playerId: PlayerId; readonly amount: number } | null;
    readonly foldedPlayerIds: readonly PlayerId[];
  } | null;
  readonly allIn: {
    readonly street: 'preflop' | 'flop' | 'turn';
    readonly heroEquity: number;
    readonly expectedNet: number;
    readonly actualNet: number;
  } | null;
  readonly explanations: readonly ExplanationMessage[];
}

export interface TurningPoint {
  readonly kind: 'badBeat' | 'suckOut' | 'swing';
  readonly playerId: PlayerId;
  readonly street: 'preflop' | 'flop' | 'turn' | 'river';
  readonly equityBefore: number;
  readonly equityAfter: number;
}

export interface HandAnalysis {
  readonly schemaVersion: 1;
  readonly handId: string;
  readonly analysisVersion: number;
  readonly computedAt: number;
  readonly decisions: readonly DecisionAnalysis[];
  /** Null only for analyses stored before outcomes existed. */
  readonly outcome: HandOutcome | null;
  readonly turningPoints: readonly TurningPoint[];
  readonly equityByStreet: readonly StreetEquity[];
}
