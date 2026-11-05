import type { ProjectedState, ServerEvent } from '@poker/protocol';

export interface HandResult {
  /** Everyone who received chips in the last hand, biggest first. */
  readonly winners: readonly { readonly playerId: string; readonly amount: number }[];
  readonly localAmount: number;
}

// Kept here for the table's existing imports; the helper itself lives in shared.
export { formatPlayerName } from '@/shared';

/** Sums the `potAwarded` events of the most recent hand; null while no hand has finished. */
export function summarizeLastHand(
  log: readonly ServerEvent[],
  viewerId: string,
): HandResult | null {
  let start = -1;
  for (let i = log.length - 1; i >= 0; i--) {
    if (log[i]?.type === 'handStarted') {
      start = i;
      break;
    }
  }
  if (start === -1 || !log.slice(start).some((e) => e.type === 'handEnded')) {
    return null;
  }

  const totals = new Map<string, number>();
  for (const event of log.slice(start)) {
    if (event.type === 'potAwarded') {
      totals.set(event.playerId, (totals.get(event.playerId) ?? 0) + event.amount);
    }
  }
  const winners = [...totals]
    .map(([playerId, amount]) => ({ playerId, amount }))
    .sort((a, b) => b.amount - a.amount);
  return { winners, localAmount: totals.get(viewerId) ?? 0 };
}

export type GameOutcome = 'playing' | 'busted' | 'won';

/** Between hands: who is still able to play. Mid-hand it is always 'playing'. */
export function gameOutcome(snapshot: ProjectedState): GameOutcome {
  if (snapshot.street !== 'idle') {
    return 'playing';
  }
  const withChips = snapshot.players.filter((p) => p.stack > 0);
  const local = snapshot.players.find((p) => p.id === snapshot.viewerId);
  if (!local || local.stack === 0) {
    return 'busted';
  }
  return withChips.length < 2 ? 'won' : 'playing';
}
