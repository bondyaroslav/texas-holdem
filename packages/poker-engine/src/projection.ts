import type { Card, Chips, PlayerId } from './types.js';
import type { BlindsConfig, GameState, PlayerStatus, Street } from './state.js';

export interface ProjectedPlayer {
  readonly id: PlayerId;
  readonly stack: Chips;
  readonly status: PlayerStatus;
  readonly committedThisStreet: Chips;
  readonly committedTotal: Chips;
  /** The viewer's own cards, or any non-folded player's once the hand reaches showdown — null otherwise. */
  readonly holeCards: readonly Card[] | null;
}

export interface ProjectedState {
  readonly viewerId: PlayerId;
  readonly street: Street;
  readonly communityCards: readonly Card[];
  readonly players: readonly ProjectedPlayer[];
  readonly dealerIndex: number;
  readonly toAct: readonly PlayerId[];
  readonly actingPlayerId: PlayerId | null;
  readonly pot: Chips;
  readonly currentBet: Chips;
  readonly minRaise: Chips;
  readonly blinds: BlindsConfig;
  readonly handNumber: number;
}

/**
 * The state a single player is allowed to see — their own hole cards, never
 * anyone else's, except once the hand reaches showdown, when every
 * non-folded player's cards are revealed (folded hands stay hidden, matching
 * table etiquette). CLAUDE.md §3.2: UI only ever works through a projection,
 * the same way a human player only sees their own cards.
 */
export function projectStateFor(state: GameState, viewerId: PlayerId): ProjectedState {
  const players = state.players.map((player) => {
    const canSeeHoleCards =
      player.id === viewerId || (state.street === 'showdown' && player.status !== 'folded');
    return {
      id: player.id,
      stack: player.stack,
      status: player.status,
      committedThisStreet: player.committedThisStreet,
      committedTotal: player.committedTotal,
      holeCards: canSeeHoleCards ? player.holeCards : null,
    };
  });

  return {
    viewerId,
    street: state.street,
    communityCards: state.communityCards,
    players,
    dealerIndex: state.dealerIndex,
    toAct: state.toAct,
    actingPlayerId: state.actingPlayerId,
    pot: state.pot,
    currentBet: state.currentBet,
    minRaise: state.minRaise,
    blinds: state.blinds,
    handNumber: state.handNumber,
  };
}
