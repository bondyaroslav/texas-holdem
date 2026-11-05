import type { Verdict } from '@poker/protocol';

/** Rules and thresholds for leak detection (CLAUDE.md §9: "правила і пороги в конфігурації"). */
export interface LeakConfig {
  /** Below this many hands, stat-based leaks are not reported — the sample is noise. */
  readonly minHands: number;
  readonly vpipHigh: number;
  readonly vpipLow: number;
  /** VPIP − PFR above this: too much calling, too little raising preflop. */
  readonly vpipPfrGap: number;
  /** Postflop aggression factor below this is passive… */
  readonly aggressionLow: number;
  /** …once there are at least this many postflop bets/raises/calls. */
  readonly minAggressionActions: number;
  /** Share of seen flops taken to showdown above this means not letting go. */
  readonly wtsdHigh: number;
  readonly minFlopsSeen: number;
  /** Share of hands with an open limp. */
  readonly limpRate: number;
  /** Verdicts that count as a costly decision. */
  readonly costlyVerdicts: readonly Verdict[];
  /** A decision-based leak needs at least this many occurrences. */
  readonly minOccurrences: number;
  /** A stat this far past its threshold (as a ratio) is a major leak rather than a moderate one. */
  readonly majorStatRatio: number;
  /** Summed EV loss (bb) that makes a decision-based leak moderate / major. */
  readonly moderateLossBb: number;
  readonly majorLossBb: number;
  /** Most recent hands linked from each leak. */
  readonly maxHandRefs: number;
}

export const DEFAULT_LEAK_CONFIG: LeakConfig = {
  minHands: 30,
  vpipHigh: 0.45,
  vpipLow: 0.12,
  vpipPfrGap: 0.2,
  aggressionLow: 1,
  minAggressionActions: 20,
  wtsdHigh: 0.4,
  minFlopsSeen: 20,
  limpRate: 0.08,
  costlyVerdicts: ['mistake', 'blunder'],
  minOccurrences: 3,
  majorStatRatio: 1.3,
  moderateLossBb: 10,
  majorLossBb: 30,
  maxHandRefs: 20,
};
