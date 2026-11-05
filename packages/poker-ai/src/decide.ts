import type { ActionInput } from '@poker/engine';
import { createMulberry32 } from '@poker/engine';
import type { BotStrategy, Difficulty, PlayerView } from './index.js';
import type { OpponentStats } from './opponent-model.js';
import { beginnerStrategy } from './strategies/beginner.js';
import { easyStrategy } from './strategies/easy.js';
import { expertStrategy, hardStrategy, mediumStrategy } from './strategies/advanced.js';

const STRATEGIES: Readonly<Record<Difficulty, BotStrategy>> = {
  beginner: beginnerStrategy,
  easy: easyStrategy,
  medium: mediumStrategy,
  hard: hardStrategy,
  expert: expertStrategy,
};

export function strategyFor(difficulty: Difficulty): BotStrategy {
  return STRATEGIES[difficulty];
}

/** Everything one bot decision needs, as plain data — so it can be posted to a worker. */
export interface BotDecisionRequest {
  readonly view: PlayerView;
  readonly difficulty: Difficulty;
  /** Seeds the decision's own RNG: equal requests give equal answers. */
  readonly seed: number;
  readonly opponentStats?: Readonly<Record<string, OpponentStats>>;
  readonly isTournament?: boolean;
}

export function decideBotAction(request: BotDecisionRequest): ActionInput {
  return strategyFor(request.difficulty).decide(request.view, {
    difficulty: request.difficulty,
    rng: createMulberry32(request.seed),
    ...(request.opponentStats ? { opponentStats: request.opponentStats } : {}),
    ...(request.isTournament !== undefined ? { isTournament: request.isTournament } : {}),
  });
}
