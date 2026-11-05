import type { BotDifficulty, Verdict } from '@poker/protocol';
import type { HandEntry, ReachedStreet, SeatPosition } from '@/shared';

export interface HandFilters {
  readonly position: SeatPosition | 'all';
  /** Hands where at least one hero decision got this verdict. */
  readonly verdict: Verdict | 'all';
  /** Hands that got at least this far. */
  readonly street: ReachedStreet | 'all';
  /** Hands with at least one bot of this level at the table. */
  readonly botLevel: BotDifficulty | 'all';
}

export const NO_FILTERS: HandFilters = {
  position: 'all',
  verdict: 'all',
  street: 'all',
  botLevel: 'all',
};

const STREET_ORDER: readonly ReachedStreet[] = ['preflop', 'flop', 'turn', 'river', 'showdown'];

export function applyFilters(
  entries: readonly HandEntry[],
  filters: HandFilters,
): readonly HandEntry[] {
  return entries.filter(({ record, summary }) => {
    if (filters.position !== 'all' && summary.heroPosition !== filters.position) return false;
    if (filters.verdict !== 'all' && !summary.verdicts.includes(filters.verdict)) return false;
    if (
      filters.street !== 'all' &&
      STREET_ORDER.indexOf(summary.lastStreet) < STREET_ORDER.indexOf(filters.street)
    ) {
      return false;
    }
    return (
      filters.botLevel === 'all' || record.players.some((p) => p.botDifficulty === filters.botLevel)
    );
  });
}
