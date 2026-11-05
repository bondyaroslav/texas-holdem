import type { PlayerId } from '@poker/engine';
import type { HandOutcome, StreetEquity, TurningPoint } from '@poker/protocol';
import type { AnalysisConfig } from '../analysis-config.js';

/** Share of the contested chips a player actually won, 0–1: the "equity" the run-out realised. */
function realisedShare(outcome: HandOutcome, playerId: PlayerId): number {
  let contested = 0;
  let won = 0;
  for (const pot of outcome.pots) {
    if (!pot.eligible.includes(playerId) || pot.eligible.length < 2) continue;
    contested += pot.amount;
    won += pot.shares.find((s) => s.playerId === playerId)?.amount ?? 0;
  }
  return contested > 0 ? won / contested : 0;
}

/**
 * The moments the equity chart should explain. Swings compare consecutive
 * street readings; bad beats and suck-outs compare the last reading taken
 * with cards still to come against what the player actually won — so a turn
 * favourite who loses on the river is a bad beat, a river reading never is.
 * Hands that ended without a showdown have no luck to explain.
 */
export function findTurningPoints(
  equityByStreet: readonly StreetEquity[],
  outcome: HandOutcome,
  thresholds: AnalysisConfig['turningPoints'],
): readonly TurningPoint[] {
  const points: TurningPoint[] = [];

  for (let i = 1; i < equityByStreet.length; i++) {
    const before = equityByStreet[i - 1];
    const after = equityByStreet[i];
    if (!before || !after) continue;
    for (const player of after.players) {
      const previous = before.players.find((p) => p.playerId === player.playerId);
      if (previous && Math.abs(player.equity - previous.equity) >= thresholds.swing) {
        points.push({
          kind: 'swing',
          playerId: player.playerId,
          street: before.street,
          equityBefore: previous.equity,
          equityAfter: player.equity,
        });
      }
    }
  }

  if (!outcome.showdown) return points;
  const lastOpen = [...equityByStreet].reverse().find((s) => s.board.length < 5);
  if (!lastOpen) return points;
  for (const player of lastOpen.players) {
    const realised = realisedShare(outcome, player.playerId);
    if (player.equity >= thresholds.favourite && realised === 0) {
      points.push({
        kind: 'badBeat',
        playerId: player.playerId,
        street: lastOpen.street,
        equityBefore: player.equity,
        equityAfter: 0,
      });
    } else if (player.equity <= thresholds.underdog && realised >= 0.5) {
      points.push({
        kind: 'suckOut',
        playerId: player.playerId,
        street: lastOpen.street,
        equityBefore: player.equity,
        equityAfter: realised,
      });
    }
  }
  return points;
}
