import type { ProjectedPlayer } from '@poker/protocol';
import type { TableStoreState } from './table-store.js';

export function selectSnapshot(state: TableStoreState) {
  return state.snapshot;
}

export function selectStatus(state: TableStoreState) {
  return state.status;
}

export function selectError(state: TableStoreState) {
  return state.error;
}

export function selectLocalPlayerId(state: TableStoreState) {
  return state.session?.localPlayerId ?? null;
}

export function selectIsLocalPlayersTurn(state: TableStoreState): boolean {
  const { snapshot, session } = state;
  if (!snapshot || !session) {
    return false;
  }
  return snapshot.actingPlayerId === session.localPlayerId;
}

/** Chips the local player still owes to call — 0 means they may check. */
export function selectToCall(state: TableStoreState): number {
  const { snapshot, session } = state;
  if (!snapshot || !session) {
    return 0;
  }
  const player = snapshot.players.find((p) => p.id === session.localPlayerId);
  if (!player) {
    return 0;
  }
  return Math.max(0, snapshot.currentBet - player.committedThisStreet);
}

export function selectIsHandInProgress(state: TableStoreState): boolean {
  return state.snapshot !== null && state.snapshot.street !== 'idle';
}

export function selectLocalPlayer(state: TableStoreState): ProjectedPlayer | null {
  const { snapshot, session } = state;
  if (!snapshot || !session) {
    return null;
  }
  return snapshot.players.find((p) => p.id === session.localPlayerId) ?? null;
}
