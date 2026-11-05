import { computeSidePots, toChips, type PlayerId, type SeatedPlayer } from '@poker/engine';
import type { ActionStep } from '../replay.js';

export interface HeroPot {
  readonly amount: number;
  /** Opponents who can win this pot alongside the hero. */
  readonly opponents: readonly PlayerId[];
}

/**
 * The pots the hero would be fighting for after putting `heroChips` more in:
 * the main pot and any side pots he is eligible for. Layers above his
 * contribution (opponents betting more than he can match) are not his to win.
 */
export function buildHeroPots(
  step: ActionStep,
  heroId: PlayerId,
  heroChips: number,
): readonly HeroPot[] {
  const players: SeatedPlayer[] = [...step.committed].map(([id, total]) => ({
    id,
    stack: toChips(0),
    holeCards: [],
    status: step.folded.has(id) ? 'folded' : 'active',
    committedThisStreet: toChips(0),
    committedTotal: toChips(total + (id === heroId ? heroChips : 0)),
  }));

  return computeSidePots(players)
    .filter((pot) => pot.eligiblePlayerIds.includes(heroId))
    .map((pot) => ({
      amount: pot.amount,
      opponents: pot.eligiblePlayerIds.filter((id) => id !== heroId),
    }));
}
