import type { ActionInput, GameState, PlayerId } from '@poker/engine';
import type { RangeStep } from './ranges/narrow-range.js';

/**
 * The public record of one action, taken from the state just before it.
 * `loggedAction` is the action as the engine logged it (an all-in appears as
 * the bet/raise/call it amounted to). Whoever runs the table keeps these per
 * hand and hands them to the bots — the same facts any player at the table saw.
 */
export function rangeStepFor(
  stateBefore: GameState,
  playerId: PlayerId,
  loggedAction: ActionInput,
  history: readonly RangeStep[],
): RangeStep | null {
  const street = stateBefore.street;
  if (street === 'idle' || street === 'showdown') return null;
  const player = stateBefore.players.find((p) => p.id === playerId);
  if (!player) return null;
  const raisesBefore = history.filter(
    (step) =>
      step.street === street && (step.action.kind === 'bet' || step.action.kind === 'raise'),
  ).length;
  return {
    eventIndex: history.length,
    playerId,
    action: loggedAction,
    street,
    board: stateBefore.communityCards,
    potBefore: stateBefore.pot,
    toCall: Math.min(
      player.stack,
      Math.max(0, stateBefore.currentBet - player.committedThisStreet),
    ),
    committedThisStreetBefore: player.committedThisStreet,
    raisesBefore,
  };
}
