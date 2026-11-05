import { evaluateScoreFast, type Card } from '@poker/engine';

/** Running totals for one participant across all sampled boards. */
export interface Tally {
  wins: number;
  ties: number;
  equity: number;
}

export function createTallies(count: number): Tally[] {
  return Array.from({ length: count }, () => ({ wins: 0, ties: 0, equity: 0 }));
}

/** Scores every hand against the full board and credits the winner(s). */
export function scoreBoard(
  holes: readonly (readonly [Card, Card])[],
  board: readonly Card[],
  tallies: Tally[],
): void {
  const scores = holes.map((hole) => evaluateScoreFast([...hole, ...board]));
  const best = Math.max(...scores);
  let winners = 0;
  for (const score of scores) {
    if (score === best) winners++;
  }
  scores.forEach((score, i) => {
    const tally = tallies[i];
    if (tally && score === best) {
      if (winners === 1) {
        tally.wins++;
      } else {
        tally.ties++;
      }
      tally.equity += 1 / winners;
    }
  });
}
