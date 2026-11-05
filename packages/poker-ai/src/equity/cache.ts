import { cardKey } from './cards.js';
import type { EquityCache, EquityInput, EquityResult, Participant } from './types.js';

/** Bounded least-recently-used cache; a `Map` keeps insertion order, so re-inserting on read refreshes an entry. */
export function createEquityCache(maxEntries = 500): EquityCache {
  const entries = new Map<string, EquityResult>();
  return {
    get(key) {
      const value = entries.get(key);
      if (value !== undefined) {
        entries.delete(key);
        entries.set(key, value);
      }
      return value;
    },
    set(key, value) {
      entries.delete(key);
      entries.set(key, value);
      if (entries.size > maxEntries) {
        const oldest = entries.keys().next();
        if (!oldest.done) entries.delete(oldest.value);
      }
    },
  };
}

function sortedKeys(cards: readonly Parameters<typeof cardKey>[0][]): string {
  return cards.map(cardKey).sort().join('');
}

function participantKey(p: Participant): string {
  if (p.kind === 'hand') {
    return `h:${sortedKeys(p.cards)}`;
  }
  const combos = p.combos.map((c) => `${sortedKeys(c.cards)}*${String(c.weight ?? 1)}`).sort();
  return `r:${combos.join(',')}`;
}

/**
 * Identity of a computation: participants (order matters — results are indexed
 * by it), unordered board and dead cards, and the sampling parameters.
 */
export function equityCacheKey(input: EquityInput, sampling: string): string {
  return [
    input.participants.map(participantKey).join('|'),
    `b:${sortedKeys(input.board)}`,
    `d:${sortedKeys(input.dead ?? [])}`,
    sampling,
  ].join('/');
}
