import type { ActionInput, Card, Chips, PlayerId, ProjectedState, Street } from '@poker/engine';
import type { TableConfig } from './table-config.js';

export type { ActionInput, ProjectedPlayer, ProjectedState } from '@poker/engine';

export interface TableSession {
  readonly tableId: string;
  readonly localPlayerId: PlayerId;
}

export type ClientCommand =
  | { readonly type: 'startHand' }
  | { readonly type: 'playerAction'; readonly playerId: PlayerId; readonly action: ActionInput }
  | { readonly type: 'advanceStreet' };

export type ServerEvent =
  | { readonly type: 'handStarted'; readonly handNumber: number }
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
  | { readonly type: 'handEnded' }
  /** Full client-safe snapshot, pushed after every command — the UI renders from this, not the deltas above. */
  | { readonly type: 'stateChanged'; readonly snapshot: ProjectedState };

export interface GatewayError {
  readonly code: string;
  readonly message: string;
}

export type Unsubscribe = () => void;

export interface GameGateway {
  connect(tableConfig: TableConfig): Promise<TableSession>;
  send(
    command: ClientCommand,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: GatewayError }>;
  subscribe(listener: (event: ServerEvent) => void): Unsubscribe;
  disconnect(): Promise<void>;
}
