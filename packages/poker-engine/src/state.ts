import type { Card, Chips, PlayerId } from './types.js';
import type { Deck } from './deck.js';

/** 'idle' = between hands, no hand in progress. */
export type Street = 'idle' | 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export type PlayerStatus = 'active' | 'folded' | 'allIn' | 'sittingOut';

export interface SeatedPlayer {
  readonly id: PlayerId;
  readonly stack: Chips;
  readonly holeCards: readonly Card[];
  readonly status: PlayerStatus;
  readonly committedThisStreet: Chips;
  readonly committedTotal: Chips;
}

export interface BlindsConfig {
  readonly smallBlind: Chips;
  readonly bigBlind: Chips;
  readonly ante: Chips;
}

export interface GameState {
  readonly street: Street;
  readonly deck: Deck;
  readonly communityCards: readonly Card[];
  readonly players: readonly SeatedPlayer[];
  /** Seat index of the dealer button; does not rotate automatically between hands. */
  readonly dealerIndex: number;
  /** Seat index that acts first on every post-flop street, fixed for the hand. */
  readonly firstToActPostflopIndex: number;
  /** Queue of player ids still owed an action this street, front = current actor. */
  readonly toAct: readonly PlayerId[];
  readonly actingPlayerId: PlayerId | null;
  readonly blinds: BlindsConfig;
  readonly pot: Chips;
  readonly currentBet: Chips;
  readonly minRaise: Chips;
  readonly handNumber: number;
}
