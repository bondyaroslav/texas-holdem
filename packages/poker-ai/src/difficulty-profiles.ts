import type { Difficulty } from './index.js';

/** Tunable per-difficulty parameters, kept out of decision logic (CLAUDE.md §5). */
export interface DifficultyProfile {
  readonly difficulty: Difficulty;
  /** 0–100 `preflopHandScore` cutoff to voluntarily continue preflop (Easy). */
  readonly preflopCallThreshold: number;
  /** 0–100 `preflopHandScore` cutoff to raise instead of call preflop (Easy). */
  readonly preflopRaiseThreshold: number;
  /** Weakest postflop hand category (1=highCard … 9=straightFlush) worth continuing with (Easy). */
  readonly minPostflopContinueCategory: number;
  /** Weakest postflop hand category worth betting/raising for value (Easy). */
  readonly minPostflopRaiseCategory: number;
  /** Chance of folding against the strategy's own rule — an unexplainable "mistake". */
  readonly foldFrequency: number;
  /** Chance of raising/betting against the strategy's own rule — another "mistake". */
  readonly raiseFrequency: number;
  /**
   * Beginner/Easy stop raising once the street's bet reaches this many big
   * blinds and call instead. Without a cap two deterministic bots re-raise each
   * other forever and the hand never leaves preflop.
   */
  readonly maxRaiseBigBlinds: number;
  readonly usesEquityCalculation: boolean;
  readonly usesOpponentModeling: boolean;

  // ---- Medium and up -------------------------------------------------------
  /** Multiplier on the positional opening frequency (1 = the shared chart). */
  readonly openScale: number;
  /** Multiplier on the 3-bet / 4-bet frequencies. */
  readonly threeBetScale: number;
  /** Multiplier on flat-calling widths. */
  readonly callScale: number;
  /** Below this many big blinds preflop becomes all-in or fold (0 = never). */
  readonly pushFoldBb: number;
  /** Chance of a flop continuation bet as the preflop raiser when checked to. */
  readonly cbetFrequency: number;
  /** Chance of a semi-bluff with a draw when no one has bet. */
  readonly semiBluffFrequency: number;
  /** Chance of a river bluff with a hopeless hand when checked to. */
  readonly bluffFrequency: number;
  /** Equity a call needs above the pot odds (implied/reverse-implied odds, caution). */
  readonly callMargin: number;
  /** Equity needed to bet for value heads-up when no one has bet. */
  readonly valueBetEquity: number;
  /** Equity needed to raise for value heads-up. */
  readonly raiseEquity: number;
  /** Monte Carlo iterations per decision (Hard+). */
  readonly equityIterations: number;
  /** Softens thresholds into probabilities (mixed strategies); 0 = always the same answer. */
  readonly mixingTemperature: number;
  /** Extra equity a tournament call risking a big share of the stack demands (ICM). */
  readonly icmRiskPremium: number;
}

const NOT_USED = {
  openScale: 1,
  threeBetScale: 1,
  callScale: 1,
  pushFoldBb: 0,
  cbetFrequency: 0,
  semiBluffFrequency: 0,
  bluffFrequency: 0,
  callMargin: 0,
  valueBetEquity: 1,
  raiseEquity: 1,
  equityIterations: 0,
  mixingTemperature: 0,
  icmRiskPremium: 0,
} as const;

const RULE_BASED_UNUSED = {
  preflopCallThreshold: 0,
  preflopRaiseThreshold: 0,
  minPostflopContinueCategory: 0,
  minPostflopRaiseCategory: 0,
  foldFrequency: 0,
  raiseFrequency: 0,
  maxRaiseBigBlinds: 4,
} as const;

export const difficultyProfiles: Readonly<Record<Difficulty, DifficultyProfile>> = {
  beginner: {
    difficulty: 'beginner',
    // Loose-passive: plays almost everything, never folds or raises on hand
    // strength alone — only the frequencies below drive its "mistakes".
    preflopCallThreshold: 0,
    preflopRaiseThreshold: 101,
    minPostflopContinueCategory: 0,
    minPostflopRaiseCategory: 10,
    foldFrequency: 0.05,
    raiseFrequency: 0.08,
    maxRaiseBigBlinds: 4,
    usesEquityCalculation: false,
    usesOpponentModeling: false,
    ...NOT_USED,
  },
  easy: {
    difficulty: 'easy',
    // Mechanical rule-follower: simple preflop score table, "pair+ continues"
    // postflop. No randomness — CLAUDE.md only calls intentional mistakes out
    // for Beginner.
    preflopCallThreshold: 40,
    preflopRaiseThreshold: 75,
    minPostflopContinueCategory: 2,
    minPostflopRaiseCategory: 3,
    foldFrequency: 0,
    raiseFrequency: 0,
    maxRaiseBigBlinds: 4,
    usesEquityCalculation: false,
    usesOpponentModeling: false,
    ...NOT_USED,
  },
  medium: {
    difficulty: 'medium',
    ...RULE_BASED_UNUSED,
    usesEquityCalculation: false,
    usesOpponentModeling: false,
    // Positional ranges, hand strength + draws vs pot odds, c-bets, a little bluffing.
    openScale: 1,
    threeBetScale: 0.8,
    callScale: 1.1,
    pushFoldBb: 0,
    cbetFrequency: 0.6,
    semiBluffFrequency: 0.25,
    bluffFrequency: 0.08,
    callMargin: 0.03,
    valueBetEquity: 0.62,
    raiseEquity: 0.78,
    equityIterations: 0,
    mixingTemperature: 0,
    icmRiskPremium: 0,
  },
  hard: {
    difficulty: 'hard',
    ...RULE_BASED_UNUSED,
    usesEquityCalculation: true,
    usesOpponentModeling: false,
    // Monte Carlo equity against narrowed ranges; balanced aggression.
    openScale: 1,
    threeBetScale: 1,
    callScale: 1,
    pushFoldBb: 12,
    cbetFrequency: 0.65,
    semiBluffFrequency: 0.45,
    bluffFrequency: 0.2,
    callMargin: 0.02,
    valueBetEquity: 0.58,
    raiseEquity: 0.72,
    equityIterations: 500,
    mixingTemperature: 0,
    icmRiskPremium: 0,
  },
  expert: {
    difficulty: 'expert',
    ...RULE_BASED_UNUSED,
    usesEquityCalculation: true,
    usesOpponentModeling: true,
    // Hard + exploits read from opponent stats, mixed frequencies, ICM caution.
    openScale: 1.05,
    threeBetScale: 1.1,
    callScale: 1,
    pushFoldBb: 14,
    cbetFrequency: 0.65,
    semiBluffFrequency: 0.5,
    bluffFrequency: 0.22,
    callMargin: 0.015,
    valueBetEquity: 0.56,
    raiseEquity: 0.7,
    equityIterations: 700,
    mixingTemperature: 0.04,
    icmRiskPremium: 0.06,
  },
};
