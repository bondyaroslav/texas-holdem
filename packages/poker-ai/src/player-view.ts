import type { GameState, PlayerId } from '@poker/engine';
import { toChips } from '@poker/engine';
import type { BettingStreet, OpponentView, PlayerView } from './index.js';
import type { RangeStep } from './ranges/narrow-range.js';
import { positionOf, type Position } from './ranges/positions.js';

function bettingStreet(state: GameState): BettingStreet {
  // Bots only act during betting rounds; idle/showdown never reach a strategy.
  return state.street === 'idle' || state.street === 'showdown' ? 'river' : state.street;
}

/** Positions of everyone dealt in, counted from the button. */
export function dealtInPositions(state: GameState): ReadonlyMap<PlayerId, Position> {
  const count = state.players.length;
  const dealtIn = state.players
    .map((player, index) => ({ player, index }))
    .filter(({ player }) => player.holeCards.length === 2 && player.status !== 'sittingOut')
    .sort(
      (a, b) =>
        ((a.index - state.dealerIndex + count) % count) -
        ((b.index - state.dealerIndex + count) % count),
    );
  const positions = new Map<PlayerId, Position>();
  if (dealtIn.length < 2) return positions;
  dealtIn.forEach(({ player }, offset) => {
    positions.set(player.id, positionOf(offset, dealtIn.length));
  });
  return positions;
}

/**
 * Projects the engine's full `GameState` down to what a single bot may see:
 * its own cards, the public table and this hand's public action history.
 */
export function toPlayerView(
  state: GameState,
  playerId: PlayerId,
  history: readonly RangeStep[] = [],
): PlayerView {
  const player = state.players.find((p) => p.id === playerId);
  if (!player) {
    throw new RangeError(`Unknown player "${playerId}" in this game state`);
  }
  const positions = dealtInPositions(state);
  const opponents: OpponentView[] = state.players
    .filter((p) => p.id !== playerId && positions.has(p.id) && p.status !== 'folded')
    .map((p) => ({
      playerId: p.id,
      stack: p.stack,
      committedThisStreet: p.committedThisStreet,
      position: positions.get(p.id) ?? 'bb',
      allIn: p.status === 'allIn',
    }));

  return {
    playerId,
    holeCards: player.holeCards,
    communityCards: state.communityCards,
    potSize: state.pot,
    toCall: toChips(Math.max(0, state.currentBet - player.committedThisStreet)),
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    bigBlind: state.blinds.bigBlind,
    stack: player.stack,
    committedThisStreet: player.committedThisStreet,
    street: bettingStreet(state),
    position: positions.get(playerId) ?? 'bb',
    playersDealtIn: Math.max(2, positions.size),
    opponents,
    history,
  };
}
