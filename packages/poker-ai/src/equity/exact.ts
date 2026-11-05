import type { Card } from '@poker/engine';
import { DECK, cardAt, fixedCardIndexes } from './cards.js';
import { createTallies, scoreBoard } from './showdown.js';
import type { Combo, EquityInput, EquityResult } from './types.js';

/** C(n, k) as a float — only used to compare against a limit, so precision beyond 2^53 is irrelevant. */
export function runoutCount(remainingCards: number, needed: number): number {
  let result = 1;
  for (let i = 0; i < needed; i++) {
    result = (result * (remainingCards - i)) / (i + 1);
  }
  return Math.round(result);
}

export function countRunouts(input: EquityInput): number {
  const used = fixedCardIndexes(input);
  return runoutCount(DECK.length - used.size, 5 - input.board.length);
}

/**
 * Enumerates every possible run-out. Only meaningful when all participants
 * hold known cards — a range would multiply the space by its size.
 */
export function exactEquity(input: EquityInput): EquityResult {
  const holes: Combo[] = [];
  for (const p of input.participants) {
    if (p.kind !== 'hand') {
      throw new RangeError('Exact equity needs known hands; use Monte Carlo for ranges');
    }
    holes.push(p.cards);
  }

  const used = fixedCardIndexes(input);
  const remaining: number[] = [];
  for (let i = 0; i < DECK.length; i++) {
    if (!used.has(i)) remaining.push(i);
  }

  const needed = 5 - input.board.length;
  const tallies = createTallies(holes.length);
  const drawn: Card[] = [];
  let samples = 0;

  const walk = (start: number): void => {
    if (drawn.length === needed) {
      scoreBoard(holes, [...input.board, ...drawn], tallies);
      samples++;
      return;
    }
    const slotsLeft = needed - drawn.length;
    for (let i = start; i <= remaining.length - slotsLeft; i++) {
      const index = remaining[i];
      if (index === undefined) continue;
      drawn.push(cardAt(index));
      walk(i + 1);
      drawn.pop();
    }
  };
  walk(0);

  return {
    method: 'exact',
    samples,
    participants: tallies.map((t) => ({
      win: t.wins / samples,
      tie: t.ties / samples,
      equity: t.equity / samples,
    })),
  };
}
