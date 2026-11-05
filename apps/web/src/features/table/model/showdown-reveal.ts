import type { ProjectedState } from '@poker/protocol';

/**
 * Once a showdown is paid out the engine goes idle and its projection hides
 * the opponents' cards and clears the board. Players still want to study the
 * hands that were shown, so until the next deal the table keeps showing what
 * the showdown revealed — only what was already public, nothing more.
 */
export function withShowdownReveal(
  snapshot: ProjectedState,
  showdown: ProjectedState | null,
): ProjectedState {
  if (snapshot.street !== 'idle' || showdown?.handNumber !== snapshot.handNumber) {
    return snapshot;
  }
  const shown = new Map(showdown.players.map((p) => [p.id, p.holeCards]));
  return {
    ...snapshot,
    communityCards: showdown.communityCards,
    players: snapshot.players.map((player) => {
      const holeCards = player.holeCards ?? shown.get(player.id) ?? null;
      return holeCards === player.holeCards ? player : { ...player, holeCards };
    }),
  };
}
