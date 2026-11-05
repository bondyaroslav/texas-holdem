import type { ActionInput, Card, PlayerId } from '@poker/engine';
import { cardKey } from '../equity/cards.js';
import type { PostflopNarrowingConfig, PreflopNarrowingConfig } from './narrowing-config.js';
import type { Position } from './positions.js';
import { openFrequency, PREFLOP_FREQUENCIES } from './preflop-ranges.js';
import { preflopPercentile, topPreflopRange } from './preflop-strength.js';
import { rankRange } from './strength.js';
import type { HandRange, WeightedCombo } from './types.js';

/** One public action and the betting situation it was taken in — all a range read needs. */
export interface RangeStep {
  /** Order of the action within the hand; only steps before `untilEventIndex` count. */
  readonly eventIndex: number;
  readonly playerId: PlayerId;
  /** As the engine logs it: `bet`/`raise` amounts are the total committed this street. */
  readonly action: ActionInput;
  readonly street: 'preflop' | 'flop' | 'turn' | 'river';
  readonly board: readonly Card[];
  readonly potBefore: number;
  readonly toCall: number;
  readonly committedThisStreetBefore: number;
  /** Bets/raises already made this street (preflop: raises over the big blind). */
  readonly raisesBefore: number;
}

export interface NarrowRangeInput {
  readonly steps: readonly RangeStep[];
  readonly villainId: PlayerId;
  /** Only the villain's actions before this event index shape the range. */
  readonly untilEventIndex: number;
  /** Cards that cannot be in the villain's hand: the hero's and every board card seen by then. */
  readonly blocked: readonly Card[];
  readonly position: Position;
  readonly playerCount: number;
  readonly bigBlind: number;
  readonly preflop: PreflopNarrowingConfig;
  readonly postflop: PostflopNarrowingConfig;
}

function scaled(
  range: HandRange,
  factor: (combo: WeightedCombo) => number,
  minWeight: number,
): HandRange {
  const next: WeightedCombo[] = [];
  for (const combo of range) {
    const weight = (combo.weight ?? 1) * factor(combo);
    if (weight >= minWeight) next.push({ cards: combo.cards, weight });
  }
  return next;
}

function preflopWeight(percentile: number, step: RangeStep, input: NarrowRangeInput): number {
  const cfg = input.preflop;
  const f = PREFLOP_FREQUENCIES;
  const action = step.action;
  const sizeBb =
    action.kind === 'bet' || action.kind === 'raise' ? action.amount / input.bigBlind : 0;
  const tighten = (fraction: number): number =>
    sizeBb > cfg.oversizeBb ? fraction * cfg.oversizeScale : fraction;

  switch (action.kind) {
    case 'bet':
    case 'raise':
      if (step.raisesBefore === 0) {
        return percentile <= tighten(openFrequency(input.position, input.playerCount)) ? 1 : 0;
      }
      if (step.raisesBefore === 1) return percentile <= tighten(f.threeBet) ? 1 : 0;
      return percentile <= f.fourBetPlus ? 1 : 0;
    case 'call': {
      if (step.raisesBefore === 0) {
        // Limp: the hands that would have raised are mostly absent, the worst fold.
        const raiseCut = openFrequency(input.position, input.playerCount) * 0.5;
        if (percentile <= raiseCut) return cfg.limpStrongWeight;
        return percentile <= cfg.limpMaxFraction ? 1 : 0;
      }
      if (step.raisesBefore === 1) {
        const width = input.position === 'bb' ? f.callOpen.bb : f.callOpen.default;
        if (percentile <= f.threeBet) return cfg.trapWeight;
        return percentile <= f.threeBet + width ? 1 : 0;
      }
      if (percentile <= f.fourBetPlus) return cfg.trapWeight;
      return percentile <= f.fourBetPlus + f.callThreeBet ? 1 : 0;
    }
    case 'check':
      // Big-blind option: the strongest hands would have raised.
      return percentile <= f.open.bb ? cfg.bbCheckStrongWeight : 1;
    default:
      return 1;
  }
}

function postflopNarrow(
  range: HandRange,
  step: RangeStep,
  cfg: PostflopNarrowingConfig,
): HandRange {
  const ranked = rankRange(range, step.board);
  const action = step.action;
  const multiplier = new Map<WeightedCombo, number>();

  if (action.kind === 'bet' || action.kind === 'raise') {
    const chips = action.amount - step.committedThisStreetBefore;
    const potFraction = step.potBefore > 0 ? chips / step.potBefore : 1;
    const valueFraction = Math.min(
      cfg.betValueMax,
      Math.max(cfg.betValueMin, cfg.betValueBase - cfg.betValueSizeSlope * potFraction),
    );
    for (const r of ranked) {
      let m = cfg.mediumWeight;
      if (r.top < valueFraction) m = 1;
      else if (r.draw) m = cfg.drawWeight;
      else if (r.top > 0.7) m = cfg.bluffWeight;
      multiplier.set(r.combo, m);
    }
  } else if (action.kind === 'call') {
    const price = step.toCall / (step.potBefore + step.toCall);
    const defended = (1 - price) * cfg.callMdfScale;
    for (const r of ranked) {
      let m = 0;
      if (r.top < cfg.trapFraction) m = cfg.trapWeight;
      else if (r.top < defended) m = 1;
      else if (r.draw) m = cfg.drawWeight;
      multiplier.set(r.combo, m);
    }
  } else if (action.kind === 'check') {
    for (const r of ranked) {
      multiplier.set(r.combo, r.top < cfg.checkTrapFraction ? cfg.checkTrapWeight : 1);
    }
  } else {
    return range;
  }

  const next = scaled(range, (combo) => multiplier.get(combo) ?? 1, cfg.minWeight);
  // A reading so tight that nothing survives says the model is off, not that the villain has no hand.
  return next.length > 0 ? next : range;
}

/**
 * What the hero could infer about a villain's holding at the moment of a
 * decision: every combo not blocked by visible cards, reweighted by each
 * action the villain took so far (preflop by position and action type,
 * postflop by hand strength, draws and bet size). Weights multiply across
 * actions. Rules and thresholds live in the narrowing config.
 */
export function narrowRange(input: NarrowRangeInput): HandRange {
  const blocked = new Set(input.blocked.map(cardKey));
  let range: HandRange = topPreflopRange(1).filter(
    (c) => !blocked.has(cardKey(c.cards[0])) && !blocked.has(cardKey(c.cards[1])),
  );

  for (const step of input.steps) {
    if (step.playerId !== input.villainId || step.eventIndex >= input.untilEventIndex) continue;
    if (step.action.kind === 'fold') continue;

    if (step.street === 'preflop') {
      const next = scaled(
        range,
        (combo) => preflopWeight(preflopPercentile(combo.cards), step, input),
        input.postflop.minWeight,
      );
      range = next.length > 0 ? next : range;
    } else {
      range = postflopNarrow(range, step, input.postflop);
    }
  }
  return range;
}
