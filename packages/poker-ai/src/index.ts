import type { ActionInput, Card, Chips, PlayerId, Rng } from '@poker/engine';
import type { OpponentStats } from './opponent-model.js';
import type { RangeStep } from './ranges/narrow-range.js';
import type { Position } from './ranges/positions.js';

export type Difficulty = 'beginner' | 'easy' | 'medium' | 'hard' | 'expert';

export type BettingStreet = 'preflop' | 'flop' | 'turn' | 'river';

/** An opponent still in the hand, as anyone at the table can see them. */
export interface OpponentView {
  readonly playerId: PlayerId;
  readonly stack: Chips;
  readonly committedThisStreet: Chips;
  readonly position: Position;
  readonly allIn: boolean;
}

/** What a bot is allowed to see — its own hole cards, never anyone else's. */
export interface PlayerView {
  readonly playerId: PlayerId;
  readonly holeCards: readonly Card[];
  readonly communityCards: readonly Card[];
  readonly potSize: Chips;
  /** Chips still needed to call; 0 means the bot may check. */
  readonly toCall: Chips;
  /** Current bet level this street; 0 means nobody has opened the betting yet. */
  readonly currentBet: Chips;
  /** Minimum size a raise must add on top of `currentBet` to be legal. */
  readonly minRaise: Chips;
  readonly bigBlind: Chips;
  readonly stack: Chips;
  readonly committedThisStreet: Chips;
  readonly street: BettingStreet;
  readonly position: Position;
  /** Players dealt into this hand, the bot included. */
  readonly playersDealtIn: number;
  /** Opponents who have not folded. */
  readonly opponents: readonly OpponentView[];
  /** Every public action of this hand so far, in order. */
  readonly history: readonly RangeStep[];
}

export interface DecisionContext {
  readonly difficulty: Difficulty;
  readonly rng: Rng;
  /** Public tendencies of the other players, by player id (Expert only reads them). */
  readonly opponentStats?: Readonly<Record<string, OpponentStats>>;
  readonly isTournament?: boolean;
}

export interface BotStrategy {
  decide(view: PlayerView, ctx: DecisionContext): ActionInput;
}

export { difficultyProfiles } from './difficulty-profiles.js';
export type { DifficultyProfile } from './difficulty-profiles.js';

export { minimumLegalBetOrRaise } from './bet-sizing.js';

export { preflopHandScore } from './hand-strength.js';

export { toPlayerView } from './player-view.js';
export { rangeStepFor } from './public-history.js';

export { beginnerStrategy } from './strategies/beginner.js';
export { easyStrategy } from './strategies/easy.js';
export { expertStrategy, hardStrategy, mediumStrategy } from './strategies/advanced.js';
export { decideBotAction, strategyFor } from './decide.js';
export type { BotDecisionRequest } from './decide.js';

export { OpponentModel } from './opponent-model.js';
export type { OpponentStats } from './opponent-model.js';

export type { Combo, HandRange, WeightedCombo } from './ranges/types.js';
export { ALL_HAND_CLASSES, combosOfClass, handClassOf } from './ranges/hand-class.js';
export type { HandClass } from './ranges/hand-class.js';
export {
  preflopPercentile,
  preflopRangeBetween,
  topPreflopRange,
} from './ranges/preflop-strength.js';
export { positionOf } from './ranges/positions.js';
export type { Position } from './ranges/positions.js';
export { openFrequency, openingRange, PREFLOP_FREQUENCIES } from './ranges/preflop-ranges.js';
export { narrowRange } from './ranges/narrow-range.js';
export type { NarrowRangeInput, RangeStep } from './ranges/narrow-range.js';
export { hasDraw, keepTopFraction, rankRange } from './ranges/strength.js';
export type { RankedCombo } from './ranges/strength.js';
export {
  DEFAULT_POSTFLOP_NARROWING,
  DEFAULT_PREFLOP_NARROWING,
} from './ranges/narrowing-config.js';
export type { PostflopNarrowingConfig, PreflopNarrowingConfig } from './ranges/narrowing-config.js';

export * from './equity/index.js';
export { cardKey } from './equity/cards.js';
