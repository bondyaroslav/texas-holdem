export { analyzeHand, ANALYSIS_VERSION } from './analyze-hand.js';
export type { AnalyzeHandOptions } from './analyze-hand.js';

// Equity lives in @poker/ai (shared with the bots); re-exported for existing consumers.
export {
  computeEquity,
  countRunouts,
  createEquityCache,
  DEFAULT_EXACT_LIMIT,
  DEFAULT_ITERATIONS,
  DEFAULT_SEED,
  equityCacheKey,
  exactEquity,
  monteCarloEquity,
} from '@poker/ai';
export type {
  Combo,
  EquityCache,
  EquityInput,
  EquityOptions,
  EquityResult,
  Participant,
  ParticipantEquity,
  WeightedCombo,
} from '@poker/ai';

export { DEFAULT_ANALYSIS_CONFIG } from './analysis-config.js';
export type {
  AnalysisConfig,
  PostflopNarrowingConfig,
  PreflopNarrowingConfig,
} from './analysis-config.js';
export { replayActions, replayHand, seatPositions } from './replay.js';
export type { ActionStep, BettingStreet, FinalTable } from './replay.js';
export { narrowRange } from '@poker/ai';
export type { NarrowRangeInput } from '@poker/ai';
export {
  analyzeDecisions,
  callEv,
  foldProbability,
  raiseEv,
  requiredEquity,
  verdictFor,
} from './decisions/index.js';
export { explainDecision, explainOutcome } from './explain/index.js';
export { analyzeOutcome, bestFive, findTurningPoints } from './outcome/index.js';
export { computeHeroStats, heroHandFacts } from './stats/index.js';
export type { HeroHandFacts, StatsEntry } from './stats/index.js';
export { DEFAULT_LEAK_CONFIG, detectLeaks } from './leaks/index.js';
export type { LeakConfig } from './leaks/index.js';
