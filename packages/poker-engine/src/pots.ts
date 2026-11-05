import type { Chips, PlayerId } from './types.js';
import { toChips } from './types.js';
import type { SeatedPlayer } from './state.js';

export interface Pot {
  readonly amount: Chips;
  /** Non-folded players who contributed enough to contest this pot. */
  readonly eligiblePlayerIds: readonly PlayerId[];
}

/**
 * Splits everything players have put in this hand into a main pot and side
 * pots, one layer per distinct contribution level. Every chip anyone — folded
 * or not — put in is accounted for in exactly one layer; a layer's winners
 * are its contributors who did not fold. Pure function of `committedTotal` +
 * `status`, so it works the same whether called mid-hand or at showdown.
 */
export function computeSidePots(players: readonly SeatedPlayer[]): readonly Pot[] {
  const contributors = players.filter((p) => p.committedTotal > 0);
  if (contributors.length === 0) {
    return [];
  }

  const thresholds = Array.from(new Set(contributors.map((p) => p.committedTotal))).sort(
    (a, b) => a - b,
  );

  const pots: Pot[] = [];
  let previousThreshold = 0;
  for (const threshold of thresholds) {
    const layerContributors = contributors.filter((p) => p.committedTotal >= threshold);
    const amount = (threshold - previousThreshold) * layerContributors.length;
    if (amount > 0) {
      const eligiblePlayerIds = layerContributors
        .filter((p) => p.status !== 'folded')
        .map((p) => p.id);
      pots.push({ amount: toChips(amount), eligiblePlayerIds });
    }
    previousThreshold = threshold;
  }

  return pots;
}

/**
 * Divides `amount` evenly among `winnersInSeatOrder`; any remainder is
 * handed out one chip at a time starting from the front of that list — pass
 * winners ordered starting from the first seat left of the dealer button so
 * the odd chip lands on the correct player.
 */
export function splitPotAmong(
  amount: Chips,
  winnersInSeatOrder: readonly PlayerId[],
): ReadonlyMap<PlayerId, Chips> {
  if (winnersInSeatOrder.length === 0) {
    throw new RangeError('Cannot split a pot with no winners');
  }

  const base = Math.floor(amount / winnersInSeatOrder.length);
  let remainder = amount % winnersInSeatOrder.length;

  const shares = new Map<PlayerId, Chips>();
  for (const id of winnersInSeatOrder) {
    const extra = remainder > 0 ? 1 : 0;
    remainder = Math.max(0, remainder - 1);
    shares.set(id, toChips(base + extra));
  }
  return shares;
}
