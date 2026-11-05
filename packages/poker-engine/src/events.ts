import type { Card, Chips, PlayerId } from './types.js';
import type { ActionInput } from './commands.js';
import type { Street } from './state.js';

export type EngineEvent =
  | { readonly type: 'handStarted'; readonly handNumber: number; readonly dealerIndex: number }
  | {
      readonly type: 'blindsPosted';
      readonly playerId: PlayerId;
      readonly amount: Chips;
      readonly kind: 'ante' | 'smallBlind' | 'bigBlind';
    }
  | { readonly type: 'cardsDealt'; readonly playerId: PlayerId; readonly cards: readonly Card[] }
  | { readonly type: 'actionTaken'; readonly playerId: PlayerId; readonly action: ActionInput }
  | {
      readonly type: 'streetAdvanced';
      readonly street: Street;
      readonly communityCards: readonly Card[];
    }
  | { readonly type: 'potAwarded'; readonly playerId: PlayerId; readonly amount: Chips }
  | { readonly type: 'handEnded' };
