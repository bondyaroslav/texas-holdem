export { BOT_DIFFICULTIES, botDifficultyForSeat, tableConfigSchema } from './table-config.js';
export type { BotDifficulty, TableConfig } from './table-config.js';

// Type-only re-export (protocol → engine stays types-only) so the UI can
// annotate `ActionInput` amounts (e.g. for a bet/raise slider) without
// reaching past protocol into `@poker/engine`.
export type { Chips } from '@poker/engine';

export type {
  ActionInput,
  ClientCommand,
  GameGateway,
  GatewayError,
  ProjectedPlayer,
  ProjectedState,
  ServerEvent,
  TableSession,
  Unsubscribe,
} from './game-gateway.js';

export type { SettingsRepository } from './settings-repository.js';

export { gameStateSchema, isSameTableConfig, savedGameSchema } from './saved-game.js';
export type { SavedGame } from './saved-game.js';
export type { GameSaveRepository } from './game-save-repository.js';

export { engineEventSchema, handRecordSchema } from './hand-record.js';
export type { HandRecord, HandRecordPlayer } from './hand-record.js';
export {
  decisionAnalysisSchema,
  handAnalysisSchema,
  handOutcomeSchema,
  turningPointSchema,
  VERDICTS,
} from './hand-analysis.js';
export type {
  DecisionAlternative,
  DecisionAnalysis,
  DecisionKind,
  ExplanationMessage,
  HandAnalysis,
  HandOutcome,
  HandOutcomePlayer,
  HandOutcomePot,
  StreetEquity,
  TurningPoint,
  Verdict,
} from './hand-analysis.js';
export type { HandAnalyzer, HandHistoryRepository } from './hand-history-repository.js';
export type { HeroStats, Leak, LeakId, LeakSeverity, Rate } from './hand-stats.js';
