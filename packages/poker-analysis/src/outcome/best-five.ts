import {
  evaluateFiveCards,
  evaluateScoreFast,
  rankValue,
  type Card,
  type HandRank,
} from '@poker/engine';

/**
 * The five cards that make the best hand out of 5–7, ordered the way a
 * player reads them: the made part first (quads, trips, pairs by size), then
 * kickers high to low; a wheel puts its ace last.
 */
export function bestFive(cards: readonly Card[]): {
  readonly rank: HandRank;
  readonly cards: readonly Card[];
} {
  if (cards.length < 5 || cards.length > 7) {
    throw new RangeError(`bestFive needs 5–7 cards, got ${String(cards.length)}`);
  }

  let best: Card[] = [];
  let bestScore = -1;
  const pick: Card[] = [];
  const walk = (start: number): void => {
    if (pick.length === 5) {
      const score = evaluateScoreFast(pick);
      if (score > bestScore) {
        bestScore = score;
        best = [...pick];
      }
      return;
    }
    for (let i = start; i <= cards.length - (5 - pick.length); i++) {
      const card = cards[i];
      if (!card) continue;
      pick.push(card);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);

  const rank = evaluateFiveCards(best);
  const isWheel =
    (rank.category === 'straight' || rank.category === 'straightFlush') &&
    rank.tiebreakers[0] === 5;
  const value = (card: Card): number => (isWheel && card.rank === 'A' ? 1 : rankValue(card.rank));
  const counts = new Map<number, number>();
  for (const card of best) counts.set(value(card), (counts.get(value(card)) ?? 0) + 1);
  const ordered = [...best].sort(
    (a, b) => (counts.get(value(b)) ?? 0) - (counts.get(value(a)) ?? 0) || value(b) - value(a),
  );
  return { rank, cards: ordered };
}
