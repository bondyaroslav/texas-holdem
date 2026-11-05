import type { Position } from './positions.js';
import { topPreflopRange } from './preflop-strength.js';
import type { HandRange } from './types.js';

/**
 * Typical preflop frequencies as a share of all starting hands, by role.
 * Shared by the bots and by hand analysis so "what a UTG raise means" has one
 * definition. Rough full-ring figures, not solver output.
 */
export const PREFLOP_FREQUENCIES = {
  /** Raise when nobody has entered the pot yet. */
  open: { utg: 0.14, mp: 0.17, hj: 0.2, co: 0.27, btn: 0.45, sb: 0.4, bb: 0.2 },
  /** Raise over a single open-raise. */
  threeBet: 0.06,
  /** Raise over a 3-bet or more. */
  fourBetPlus: 0.025,
  /** Flat-call a single open-raise. */
  callOpen: { default: 0.16, bb: 0.3 },
  /** Flat-call a 3-bet or more. */
  callThreeBet: 0.08,
  /** Share of hands that open when only two players are dealt in (button). */
  headsUpOpen: 0.8,
} as const;

export function openFrequency(position: Position, playerCount: number): number {
  if (playerCount === 2 && position === 'btn') {
    return PREFLOP_FREQUENCIES.headsUpOpen;
  }
  return PREFLOP_FREQUENCIES.open[position];
}

export function openingRange(position: Position, playerCount: number): HandRange {
  return topPreflopRange(openFrequency(position, playerCount));
}
