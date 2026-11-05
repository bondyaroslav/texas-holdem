import {
  DEFAULT_POSTFLOP_NARROWING,
  DEFAULT_PREFLOP_NARROWING,
  type PostflopNarrowingConfig,
  type PreflopNarrowingConfig,
} from '@poker/ai';

export type { PostflopNarrowingConfig, PreflopNarrowingConfig };

export interface AnalysisConfig {
  /** Largest EV loss, in big blinds, that still earns each verdict; anything above `mistake` is a blunder. */
  readonly verdictThresholdsBb: {
    readonly good: number;
    readonly inaccuracy: number;
    readonly mistake: number;
  };
  /** Monte Carlo iterations per equity computation inside decision analysis. */
  readonly decisionIterations: number;
  /** Size of the alternative bet/raise, as a fraction of the pot, when the hero did not raise. */
  readonly raiseSizeFraction: number;
  /** Scales how often opponents fold to a bet, relative to minimum defence frequency. */
  readonly foldEquityScale: number;
  /** Weight given to a loss measured against a heuristic (estimated) alternative, 0–1. */
  readonly estimateConfidence: number;
  /** Equity thresholds for calling out turning points on the equity chart. */
  readonly turningPoints: {
    /** At or above this, losing at showdown is a bad beat. */
    readonly favourite: number;
    /** At or below this, winning at showdown is a suck-out. */
    readonly underdog: number;
    /** A street-to-street equity change at least this large is a swing. */
    readonly swing: number;
  };
  readonly preflopNarrowing: PreflopNarrowingConfig;
  readonly postflopNarrowing: PostflopNarrowingConfig;
}

export const DEFAULT_ANALYSIS_CONFIG: AnalysisConfig = {
  // CLAUDE.md §9: best/good ≤0.3bb, inaccuracy ≤1.5bb, mistake ≤5bb, blunder >5bb.
  verdictThresholdsBb: { good: 0.3, inaccuracy: 1.5, mistake: 5 },
  decisionIterations: 10_000,
  raiseSizeFraction: 0.75,
  foldEquityScale: 1,
  estimateConfidence: 0.5,
  turningPoints: { favourite: 0.7, underdog: 0.3, swing: 0.35 },
  preflopNarrowing: DEFAULT_PREFLOP_NARROWING,
  postflopNarrowing: DEFAULT_POSTFLOP_NARROWING,
};
