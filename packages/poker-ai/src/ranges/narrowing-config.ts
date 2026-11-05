/**
 * Rules for reading a range from actions, shared by the bots and the hand
 * analysis so both reason about opponents the same way.
 */
/** How a villain's range is tightened by what they did preflop. */
export interface PreflopNarrowingConfig {
  /** Raises larger than this many big blinds tighten the range. */
  readonly oversizeBb: number;
  /** Factor applied to the raising frequency for an oversized raise. */
  readonly oversizeScale: number;
  /** Weight kept for the strongest hands when they only call (slow-play). */
  readonly trapWeight: number;
  /** Weakest fraction of hands (by strength) that still limp. */
  readonly limpMaxFraction: number;
  /** Weight of the strongest hands in a limping range (they would usually raise). */
  readonly limpStrongWeight: number;
  /** Weight of the strongest hands in a range that checked its big-blind option. */
  readonly bbCheckStrongWeight: number;
}

/** How a villain's range is reshaped by a postflop action, relative to the range they held before it. */
export interface PostflopNarrowingConfig {
  /** Top fraction of the range that bets for value, before size adjustment. */
  readonly betValueBase: number;
  /** How much each pot-sized unit of bet shrinks the value fraction. */
  readonly betValueSizeSlope: number;
  readonly betValueMin: number;
  readonly betValueMax: number;
  /** Weight of weak, drawless hands in a betting range (pure bluffs). */
  readonly bluffWeight: number;
  /** Weight of drawing hands outside the value part of a betting range (semi-bluffs). */
  readonly drawWeight: number;
  /** Weight of medium-strength hands that rarely bet. */
  readonly mediumWeight: number;
  /** Share of the minimum defence frequency a calling range actually defends. */
  readonly callMdfScale: number;
  /** Top fraction of a calling range that would rather raise… */
  readonly trapFraction: number;
  /** …and the weight it keeps when it just calls. */
  readonly trapWeight: number;
  /** Top fraction of a checking range that would rather bet… */
  readonly checkTrapFraction: number;
  /** …and the weight it keeps when it checks. */
  readonly checkTrapWeight: number;
  /** Combos below this weight are dropped. */
  readonly minWeight: number;
}

export const DEFAULT_PREFLOP_NARROWING: PreflopNarrowingConfig = {
  oversizeBb: 4,
  oversizeScale: 0.8,
  trapWeight: 0.15,
  limpMaxFraction: 0.6,
  limpStrongWeight: 0.2,
  bbCheckStrongWeight: 0.2,
};

export const DEFAULT_POSTFLOP_NARROWING: PostflopNarrowingConfig = {
  betValueBase: 0.6,
  betValueSizeSlope: 0.2,
  betValueMin: 0.2,
  betValueMax: 0.55,
  bluffWeight: 0.2,
  drawWeight: 0.6,
  mediumWeight: 0.1,
  callMdfScale: 0.9,
  // Only the very top would raise or bet instead; a wider slice would cut
  // ordinary top pairs out of calling and checking ranges.
  trapFraction: 0.04,
  trapWeight: 0.35,
  checkTrapFraction: 0.05,
  checkTrapWeight: 0.4,
  minWeight: 0.01,
};
