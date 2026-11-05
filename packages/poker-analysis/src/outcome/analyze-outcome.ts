import {
  computeSidePots,
  splitPotAmong,
  toChips,
  type Card,
  type HandRank,
  type PlayerId,
  type SeatedPlayer,
} from '@poker/engine';
import type { HandOutcome, HandOutcomePot, HandRecord } from '@poker/protocol';
import { computeEquity, type Combo } from '@poker/ai';
import { explainOutcome } from '../explain/explain-outcome.js';
import type { ActionStep, FinalTable } from '../replay.js';
import { bestFive } from './best-five.js';

/** How many leading tiebreakers describe the made hand itself; the rest are kickers. */
const MADE_RANKS: Readonly<Record<HandRank['category'], number>> = {
  highCard: 1,
  pair: 1,
  twoPair: 2,
  threeOfAKind: 1,
  straight: 1,
  flush: 5,
  fullHouse: 2,
  fourOfAKind: 1,
  straightFlush: 1,
};

function toCombo(cards: readonly Card[]): Combo | null {
  const [a, b] = cards;
  return a && b ? [a, b] : null;
}

function finalPots(final: FinalTable): ReturnType<typeof computeSidePots> {
  const players: SeatedPlayer[] = [...final.committed].map(([id, total]) => ({
    id,
    stack: toChips(0),
    holeCards: [],
    status: final.folded.has(id) ? 'folded' : 'active',
    committedThisStreet: toChips(0),
    committedTotal: toChips(total),
  }));
  return computeSidePots(players);
}

function decide(
  winners: readonly PlayerId[],
  eligible: readonly PlayerId[],
  ranks: ReadonlyMap<PlayerId, HandRank>,
): Pick<HandOutcomePot, 'decidedBy' | 'kickerRank'> {
  const losers = eligible.filter((id) => !winners.includes(id));
  const winner = ranks.get(winners[0] ?? ('' as PlayerId));
  const runnerUp = losers
    .map((id) => ranks.get(id))
    .reduce<HandRank | undefined>(
      (top, r) => (r && (!top || r.score > top.score) ? r : top),
      undefined,
    );
  if (!winner || !runnerUp) {
    return { decidedBy: winners.length > 1 ? 'tie' : 'uncontested', kickerRank: null };
  }
  if (winner.category !== runnerUp.category) return { decidedBy: 'category', kickerRank: null };
  const index = winner.tiebreakers.findIndex((value, i) => value !== runnerUp.tiebreakers[i]);
  if (index < MADE_RANKS[winner.category]) return { decidedBy: 'rank', kickerRank: null };
  return { decidedBy: 'kicker', kickerRank: winner.tiebreakers[index] ?? null };
}

/**
 * Why the hand ended the way it did: best five cards and kickers, every
 * (side) pot with its winners and odd-chip split, the fold that ended it, and
 * — when the hero was all in with cards to come — the expected result next to
 * the actual one. Pot shares follow the engine's own rules, so they match
 * the recorded `potAwarded` events.
 */
export function analyzeOutcome(
  record: HandRecord,
  steps: readonly ActionStep[],
  final: FinalTable,
  options: { readonly iterations: number },
): HandOutcome {
  const live = record.players.filter((p) => !final.folded.has(p.id));
  const showdown = final.reachedShowdown && live.length >= 2 && final.board.length === 5;

  const ranks = new Map<PlayerId, HandRank>();
  const players = record.players.map((p) => {
    let bestHand: HandOutcome['players'][number]['bestHand'] = null;
    if (showdown && !final.folded.has(p.id)) {
      const best = bestFive([...p.holeCards, ...final.board]);
      ranks.set(p.id, best.rank);
      bestHand = {
        category: best.rank.category,
        cards: best.cards,
        tiebreakers: best.rank.tiebreakers,
      };
    }
    return { playerId: p.id, net: p.endingStack - p.startingStack, bestHand };
  });

  // Odd chips go to the first winner left of the button (CLAUDE.md §1), as in the engine.
  const seatCount = Math.max(...record.players.map((p) => p.seat)) + 1;
  const seatOrder = [...record.players]
    .sort(
      (a, b) =>
        ((a.seat - record.dealerIndex - 1 + seatCount * 2) % seatCount) -
        ((b.seat - record.dealerIndex - 1 + seatCount * 2) % seatCount),
    )
    .map((p) => p.id);

  const pots: HandOutcomePot[] = finalPots(final).map((pot) => {
    const eligible = pot.eligiblePlayerIds;
    let winners: readonly PlayerId[] = eligible;
    if (eligible.length > 1) {
      const best = Math.max(...eligible.map((id) => ranks.get(id)?.score ?? -1));
      winners = eligible.filter((id) => (ranks.get(id)?.score ?? -1) === best);
    }
    const ordered = seatOrder.filter((id) => winners.includes(id));
    const shares =
      ordered.length > 0
        ? [...splitPotAmong(pot.amount, ordered)].map(([playerId, amount]) => ({
            playerId,
            amount,
          }))
        : [];
    return { amount: pot.amount, eligible, shares, ...decide(winners, eligible, ranks) };
  });

  const outcome: Omit<HandOutcome, 'explanations'> = {
    showdown,
    players,
    pots,
    foldWin: showdown
      ? null
      : foldWin(
          live.map((p) => p.id),
          steps,
        ),
    allIn: allInView(record, steps, final, options.iterations),
  };
  return {
    ...outcome,
    explanations: explainOutcome(outcome, record.heroId, record.blinds.bigBlind),
  };
}

function foldWin(live: readonly PlayerId[], steps: readonly ActionStep[]): HandOutcome['foldWin'] {
  const [winnerId] = live;
  const last = steps.at(-1);
  if (live.length !== 1 || !winnerId || !last) return null;

  const aggression = [...steps]
    .reverse()
    .find((s) => s.action.kind === 'bet' || s.action.kind === 'raise');
  const since = aggression?.eventIndex ?? -1;
  const lastAggression =
    aggression && (aggression.action.kind === 'bet' || aggression.action.kind === 'raise')
      ? { playerId: aggression.playerId, amount: aggression.action.amount }
      : null;
  return {
    winnerId,
    street: last.street,
    lastAggression,
    foldedPlayerIds: steps
      .filter((s) => s.action.kind === 'fold' && s.eventIndex > since)
      .map((s) => s.playerId),
  };
}

/**
 * All-in EV: once no more betting is possible (at most one live player has
 * chips behind) with board cards still to come, the hero's result is valued
 * at his equity per pot against the live hands. Dead (folded) cards are
 * ignored, as trackers conventionally do.
 */
function allInView(
  record: HandRecord,
  steps: readonly ActionStep[],
  final: FinalTable,
  iterations: number,
): HandOutcome['allIn'] {
  const last = steps.at(-1);
  if (!last || final.folded.has(record.heroId) || !final.reachedShowdown) return null;
  const boardThen = last.board;
  if (boardThen.length >= 5) return null;

  const live = record.players.filter((p) => !final.folded.has(p.id));
  const withChips = live.filter((p) => p.startingStack - (final.committed.get(p.id) ?? 0) > 0);
  if (live.length < 2 || withChips.length > 1) return null;

  const hole = new Map<PlayerId, Combo>();
  for (const p of live) {
    const combo = toCombo(p.holeCards);
    if (!combo) return null;
    hole.set(p.id, combo);
  }
  const heroHole = hole.get(record.heroId);
  if (!heroHole) return null;

  let expected = -(final.committed.get(record.heroId) ?? 0);
  let mainEquity: number | null = null;
  for (const pot of finalPots(final)) {
    if (!pot.eligiblePlayerIds.includes(record.heroId)) continue;
    const opponents = pot.eligiblePlayerIds.filter((id) => id !== record.heroId);
    let equity = 1;
    if (opponents.length > 0) {
      const result = computeEquity(
        {
          participants: [
            { kind: 'hand', cards: heroHole },
            ...opponents.flatMap((id) => {
              const cards = hole.get(id);
              return cards ? [{ kind: 'hand' as const, cards }] : [];
            }),
          ],
          board: boardThen,
        },
        { iterations, seed: record.seed },
      );
      equity = result.participants[0]?.equity ?? 0;
    }
    mainEquity ??= equity;
    expected += equity * pot.amount;
  }

  const hero = record.players.find((p) => p.id === record.heroId);
  if (!hero || mainEquity === null) return null;
  const street = boardThen.length === 0 ? 'preflop' : boardThen.length === 3 ? 'flop' : 'turn';
  return {
    street,
    heroEquity: mainEquity,
    expectedNet: Math.round(expected * 100) / 100,
    actualNet: hero.endingStack - hero.startingStack,
  };
}
