import type { HandAnalysis, HandRecord } from '@poker/protocol';

export interface EquitySeriesModel {
  readonly streets: readonly ('preflop' | 'flop' | 'turn' | 'river')[];
  readonly players: readonly {
    readonly id: string;
    readonly slot: number;
    readonly values: readonly (number | null)[];
  }[];
}

/** At most this many lines: the categorical palette has eight validated colours, never cycled. */
const MAX_SERIES = 8;

/**
 * Equity per street (0–100) for each player who was dealt in, hero first so he
 * always gets the first colour, then by seat. A player missing from a street's
 * reading (folded) has a gap there.
 */
export function equitySeries(record: HandRecord, analysis: HandAnalysis): EquitySeriesModel {
  const readings = analysis.equityByStreet;
  const ids = [...record.players]
    .sort(
      (a, b) => Number(b.id === record.heroId) - Number(a.id === record.heroId) || a.seat - b.seat,
    )
    .map((p) => p.id)
    .filter((id) => readings.some((r) => r.players.some((p) => p.playerId === id)))
    .slice(0, MAX_SERIES);
  return {
    streets: readings.map((r) => r.street),
    players: ids.map((id, i) => ({
      id,
      slot: i + 1,
      values: readings.map((r) => {
        const equity = r.players.find((p) => p.playerId === id)?.equity;
        return equity === undefined ? null : Math.round(equity * 1000) / 10;
      }),
    })),
  };
}
