import type { Card, PlayerId } from './types.js';
import { evaluateBestHand } from './hand-rank.js';

/**
 * Evaluates every player's best hand and groups them strongest-first, each
 * inner array a tie group. This is exactly the `rankedGroups` shape the
 * `resolveShowdown` command expects (see reduce.ts) — the orchestration layer
 * calls this once hole cards and the full board are known, then issues
 * `resolveShowdown` with the result.
 */
export function rankPlayersForShowdown(
  hands: ReadonlyMap<PlayerId, readonly Card[]>,
  communityCards: readonly Card[],
): readonly (readonly PlayerId[])[] {
  const evaluated = Array.from(hands.entries())
    .map(([playerId, holeCards]) => ({
      playerId,
      rank: evaluateBestHand([...holeCards, ...communityCards]),
    }))
    .sort((a, b) => b.rank.score - a.rank.score);

  const groups: { score: number; playerIds: PlayerId[] }[] = [];
  for (const entry of evaluated) {
    const last = groups.at(-1);
    if (last?.score === entry.rank.score) {
      last.playerIds.push(entry.playerId);
    } else {
      groups.push({ score: entry.rank.score, playerIds: [entry.playerId] });
    }
  }

  return groups.map((g) => g.playerIds);
}
