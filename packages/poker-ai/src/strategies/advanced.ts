import type { ActionInput, Card, PlayerId, Rng } from '@poker/engine';
import type { BotStrategy, DecisionContext, Difficulty, PlayerView } from '../index.js';
import { difficultyProfiles, type DifficultyProfile } from '../difficulty-profiles.js';
import { betOrRaiseTo, canRaise, potFractionBet } from '../bet-sizing.js';
import { boardWetness, drawInfo, heuristicEquity } from '../postflop.js';
import { DEFAULT_OPPONENT_STATS, type OpponentStats } from '../opponent-model.js';
import { computeEquity } from '../equity/compute-equity.js';
import type { Participant } from '../equity/types.js';
import { narrowRange, type RangeStep } from '../ranges/narrow-range.js';
import {
  DEFAULT_POSTFLOP_NARROWING,
  DEFAULT_PREFLOP_NARROWING,
} from '../ranges/narrowing-config.js';
import { openFrequency, PREFLOP_FREQUENCIES } from '../ranges/preflop-ranges.js';
import { preflopPercentile } from '../ranges/preflop-strength.js';
import type { Combo } from '../ranges/types.js';

const isAggressive = (step: RangeStep): boolean =>
  step.action.kind === 'bet' || step.action.kind === 'raise';

/** How Expert bends its play against what it has seen from the opponent it is up against. */
interface Exploits {
  readonly callMargin: number;
  readonly bluffScale: number;
  readonly cbetScale: number;
  readonly valueShift: number;
  /** Multiplier on preflop 3-bet/call widths against this raiser. */
  readonly preflopWidth: number;
}

const NO_EXPLOITS: Exploits = {
  callMargin: 0,
  bluffScale: 1,
  cbetScale: 1,
  valueShift: 0,
  preflopWidth: 1,
};

const clamp = (value: number, low: number, high: number): number =>
  Math.min(high, Math.max(low, value));

/** The opponent whose action the bot is answering: the last aggressor, else the only one left. */
function mainOpponent(view: PlayerView): PlayerId | null {
  const live = new Set(view.opponents.map((o) => o.playerId));
  const aggressor = view.history.filter((s) => isAggressive(s) && live.has(s.playerId)).at(-1);
  return aggressor?.playerId ?? view.opponents[0]?.playerId ?? null;
}

function exploitsFor(view: PlayerView, ctx: DecisionContext, profile: DifficultyProfile): Exploits {
  if (!profile.usesOpponentModeling) return NO_EXPLOITS;
  const id = mainOpponent(view);
  const stats: OpponentStats =
    (id !== null ? ctx.opponentStats?.[id] : undefined) ?? DEFAULT_OPPONENT_STATS;
  const station = stats.vpip > 0.45;
  return {
    // Maniacs bet with air, so call them lighter; passive players' bets mean it.
    callMargin: stats.af > 3 ? -0.04 : stats.af < 1 ? 0.05 : 0,
    bluffScale: station ? 0.4 : clamp(stats.foldToCbet / 0.45, 0.5, 1.6),
    cbetScale: station ? 0.6 : clamp(stats.foldToCbet / 0.45, 0.6, 1.5),
    valueShift: station ? -0.05 : 0,
    preflopWidth: stats.pfr > 0.25 ? 1.3 : stats.pfr < 0.08 ? 0.7 : 1,
  };
}

/**
 * `value` at or above `threshold`. With a mixing temperature the cut-off is
 * soft — near the threshold either answer can come out (a mixed strategy),
 * so the bot cannot be read off a single fixed line.
 */
function clears(value: number, threshold: number, temperature: number, rng: Rng): boolean {
  if (temperature <= 0) return value >= threshold;
  const p = 1 / (1 + Math.exp(-(value - threshold) / temperature));
  return rng.next() < p;
}

/** Extra equity a tournament call demands when it puts much of the stack at risk (ICM). */
function icmPremium(view: PlayerView, ctx: DecisionContext, profile: DifficultyProfile): number {
  if (!ctx.isTournament || profile.icmRiskPremium <= 0) return 0;
  const risk = Math.min(1, view.toCall / Math.max(1, view.stack));
  if (risk < 0.3) return 0;
  return profile.icmRiskPremium * risk * (view.playersDealtIn <= 4 ? 1.5 : 1);
}

function call(view: PlayerView): ActionInput {
  return view.toCall >= view.stack ? { kind: 'allIn' } : { kind: 'call' };
}

function foldOrCheck(view: PlayerView): ActionInput {
  return view.toCall <= 0 ? { kind: 'check' } : { kind: 'fold' };
}

// ---- preflop ---------------------------------------------------------------

function preflop(
  view: PlayerView,
  ctx: DecisionContext,
  profile: DifficultyProfile,
  exploits: Exploits,
): ActionInput {
  const [a, b] = view.holeCards;
  if (!a || !b) return foldOrCheck(view);
  const p = preflopPercentile([a, b]);
  const temp = profile.mixingTemperature * 0.5;
  // Percentile: smaller is stronger, so "within a width" is clears(-p, -width).
  const within = (width: number): boolean => clears(-p, -width, temp, ctx.rng);
  const bb = view.bigBlind;
  const raises = view.history.filter((s) => s.street === 'preflop' && isAggressive(s)).length;
  const limpers = view.history.filter(
    (s) => s.street === 'preflop' && s.action.kind === 'call' && s.raisesBefore === 0,
  ).length;
  const stackBb = (view.stack + view.committedThisStreet) / bb;
  const f = PREFLOP_FREQUENCIES;
  const icm = ctx.isTournament && profile.icmRiskPremium > 0 && view.toCall > 0.3 * view.stack;
  const callWidthScale = profile.callScale * exploits.preflopWidth * (icm ? 0.75 : 1);

  // Short stacked: all-in or fold, nothing in between.
  if (profile.pushFoldBb > 0 && stackBb <= profile.pushFoldBb) {
    const shortness = 1 + (profile.pushFoldBb - stackBb) / profile.pushFoldBb;
    const width =
      raises === 0
        ? Math.min(0.7, openFrequency(view.position, view.playersDealtIn) * 1.3 * shortness)
        : (f.threeBet + f.callOpen.default * 0.5) * callWidthScale * shortness;
    return within(width) ? { kind: 'allIn' } : foldOrCheck(view);
  }

  if (raises === 0) {
    const open = openFrequency(view.position, view.playersDealtIn) * profile.openScale;
    if (within(open)) {
      const size = (view.playersDealtIn === 2 ? 3 : 2.5) + limpers;
      return betOrRaiseTo(view, size * bb);
    }
    if (view.toCall <= 0) return { kind: 'check' };
    // Over-limp or complete with hands just outside the opening range.
    if (limpers > 0 && view.toCall <= bb && within(open * 1.5)) return call(view);
    return { kind: 'fold' };
  }

  // Big raises mean strong ranges: answer them with fewer hands.
  const oversized = view.currentBet / bb > 4 * Math.max(1, raises) ? 0.7 : 1;

  if (raises === 1) {
    const threeBet = f.threeBet * profile.threeBetScale * exploits.preflopWidth * oversized;
    const flat =
      (view.position === 'bb' ? f.callOpen.bb : f.callOpen.default) * callWidthScale * oversized;
    if (canRaise(view) && within(threeBet)) return betOrRaiseTo(view, view.currentBet * 3);
    if (view.toCall <= 0.25 * view.stack || p <= threeBet) {
      if (within(threeBet + flat)) return call(view);
    }
    return foldOrCheck(view);
  }

  const fourBet = f.fourBetPlus * profile.threeBetScale * oversized;
  if (canRaise(view) && within(fourBet)) {
    return stackBb < 40 ? { kind: 'allIn' } : betOrRaiseTo(view, view.currentBet * 2.3);
  }
  if (within(fourBet + f.callThreeBet * callWidthScale * oversized)) return call(view);
  return foldOrCheck(view);
}

// ---- postflop --------------------------------------------------------------

function rangeEquity(view: PlayerView, ctx: DecisionContext, profile: DifficultyProfile): number {
  const [a, b] = view.holeCards;
  if (!a || !b) return 0;
  const hole: Combo = [a, b];
  const blocked: Card[] = [a, b, ...view.communityCards];
  try {
    const villains: Participant[] = view.opponents.map((opponent) => ({
      kind: 'range',
      combos: narrowRange({
        steps: view.history,
        villainId: opponent.playerId,
        untilEventIndex: view.history.length,
        blocked,
        position: opponent.position,
        playerCount: view.playersDealtIn,
        bigBlind: view.bigBlind,
        preflop: DEFAULT_PREFLOP_NARROWING,
        postflop: DEFAULT_POSTFLOP_NARROWING,
      }),
    }));
    const result = computeEquity(
      { participants: [{ kind: 'hand', cards: hole }, ...villains], board: view.communityCards },
      {
        mode: 'monteCarlo',
        iterations: profile.equityIterations,
        seed: Math.floor(ctx.rng.next() * 2 ** 32) >>> 0,
      },
    );
    return result.participants[0]?.equity ?? 0;
  } catch {
    // Ranges that leave nothing to sample are a model failure, not a reason to crash a game.
    return multiwayAdjusted(heuristicEquity(hole, view.communityCards), view.opponents.length);
  }
}

/** Heads-up rule-of-thumb equity scaled down for each extra opponent. */
function multiwayAdjusted(equity: number, opponents: number): number {
  return equity ** (1 + 0.6 * Math.max(0, opponents - 1));
}

function postflop(
  view: PlayerView,
  ctx: DecisionContext,
  profile: DifficultyProfile,
  exploits: Exploits,
): ActionInput {
  const board = view.communityCards;
  const opponents = Math.max(1, view.opponents.length);
  const equity = profile.usesEquityCalculation
    ? rangeEquity(view, ctx, profile)
    : multiwayAdjusted(heuristicEquity(view.holeCards, board), opponents);
  const temp = profile.mixingTemperature;
  const rng = ctx.rng;
  const draws = drawInfo(view.holeCards, board);
  const wetness = boardWetness(board);
  const spr = view.stack / Math.max(1, view.potSize);
  const texture = profile.usesEquityCalculation;

  // Hard+: size up on boards with draws to charge them, smaller on dry boards, polar on the river.
  const valueSize = !texture
    ? 0.6
    : view.street === 'river'
      ? 0.75
      : wetness > 0.5
        ? 0.75
        : wetness > 0.2
          ? 0.6
          : 0.4;
  const valueEquity = profile.valueBetEquity + 0.06 * (opponents - 1) + exploits.valueShift;
  const raiseEquity = profile.raiseEquity + 0.05 * (opponents - 1) + exploits.valueShift;
  const raiseAllowed = canRaise(view);
  const commit = texture && spr < 1.5;

  if (view.toCall > 0) {
    const toCall = Math.min(view.toCall, view.stack);
    const required = toCall / (view.potSize + toCall);
    const need =
      required + profile.callMargin + exploits.callMargin + icmPremium(view, ctx, profile);
    if (raiseAllowed && clears(equity, raiseEquity, temp, rng)) {
      return commit ? { kind: 'allIn' } : potFractionBet(view, valueSize + 0.25);
    }
    const betsThisStreet = view.history.filter(
      (s) => s.street === view.street && isAggressive(s),
    ).length;
    if (
      raiseAllowed &&
      texture &&
      view.street !== 'river' &&
      draws.outs >= 8 &&
      betsThisStreet === 1 &&
      rng.next() < profile.semiBluffFrequency * 0.35 * exploits.bluffScale
    ) {
      return potFractionBet(view, valueSize + 0.25);
    }
    return clears(equity, need, temp, rng) ? call(view) : { kind: 'fold' };
  }

  if (clears(equity, valueEquity, temp, rng)) {
    return commit ? { kind: 'allIn' } : potFractionBet(view, valueSize);
  }
  const lastRaiser = view.history
    .filter((s) => s.street === 'preflop' && isAggressive(s))
    .at(-1)?.playerId;
  const cbetSize = texture ? (wetness > 0.4 ? 0.6 : 0.35) : 0.5;
  if (
    view.street === 'flop' &&
    lastRaiser === view.playerId &&
    opponents <= 2 &&
    rng.next() < profile.cbetFrequency * (texture && wetness < 0.3 ? 1.1 : 0.9) * exploits.cbetScale
  ) {
    return potFractionBet(view, cbetSize);
  }
  if (view.street !== 'river' && draws.outs >= 8 && rng.next() < profile.semiBluffFrequency) {
    return potFractionBet(view, valueSize);
  }
  if (
    view.street === 'river' &&
    opponents === 1 &&
    equity < 0.2 &&
    rng.next() < profile.bluffFrequency * exploits.bluffScale
  ) {
    return potFractionBet(view, 0.7);
  }
  return { kind: 'check' };
}

/**
 * Medium, Hard and Expert share one line of play and differ in what the
 * profile switches on: Medium judges hands by rules of thumb; Hard runs
 * Monte Carlo against narrowed ranges and sizes by texture and SPR; Expert
 * also exploits opponent stats, mixes its actions and respects ICM.
 */
export function createAdvancedStrategy(difficulty: Difficulty): BotStrategy {
  const profile = difficultyProfiles[difficulty];
  return {
    decide(view: PlayerView, ctx: DecisionContext): ActionInput {
      const exploits = exploitsFor(view, ctx, profile);
      return view.street === 'preflop' || view.communityCards.length === 0
        ? preflop(view, ctx, profile, exploits)
        : postflop(view, ctx, profile, exploits);
    },
  };
}

export const mediumStrategy: BotStrategy = createAdvancedStrategy('medium');
export const hardStrategy: BotStrategy = createAdvancedStrategy('hard');
export const expertStrategy: BotStrategy = createAdvancedStrategy('expert');
