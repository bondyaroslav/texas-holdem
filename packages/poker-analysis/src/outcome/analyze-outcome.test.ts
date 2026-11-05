import fc from 'fast-check';
import {
  createInitialState,
  createMulberry32,
  rankPlayersForShowdown,
  reduce,
  toChips,
  toPlayerId,
  type ActionInput,
  type Card,
  type EngineCommand,
  type EngineEvent,
  type GameState,
  type PlayerId,
} from '@poker/engine';
import { handOutcomeSchema, type HandRecord } from '@poker/protocol';
import { describe, expect, it } from 'vitest';
import { buildRecord, bet, call, check, fold, post, raise, street } from '../record-builder.js';
import { replayHand } from '../replay.js';
import { cards } from '../test-helpers.js';
import { analyzeOutcome } from './analyze-outcome.js';
import { bestFive } from './best-five.js';

function outcomeOf(record: HandRecord) {
  const { steps, final } = replayHand(record);
  const outcome = analyzeOutcome(record, steps, final, { iterations: 4_000 });
  expect(handOutcomeSchema.safeParse(outcome).success).toBe(true);
  return outcome;
}

const award = (player: string, amount: number): EngineEvent => ({
  type: 'potAwarded',
  playerId: toPlayerId(player),
  amount: toChips(amount),
});
const checkDown = (flop: string, turn: string, river: string, first: string, second: string) => [
  street('flop', flop),
  check(first),
  check(second),
  street('turn', turn),
  check(first),
  check(second),
  street('river', river),
  check(first),
  check(second),
  street('showdown'),
];
const ranks = (list: readonly Card[]): string => list.map((c) => c.rank).join('');

describe('bestFive', () => {
  it.each([
    ['Ah Ad Kc Ks Kd 3c 2h', 'fullHouse', 'KKKAA'],
    ['Ah Ad Kc 7s 5d 3c 2h', 'pair', 'AAK75'],
    ['As 2d 3h 4c 5s Kd Qc', 'straight', '5432A'],
    ['9s 9h 9d 9c Ah Kd 2c', 'fourOfAKind', '9999A'],
  ])('%s → %s', (spec, category, expected) => {
    const best = bestFive(cards(spec));
    expect(best.rank.category).toBe(category);
    expect(ranks(best.cards)).toBe(expected);
  });
});

describe('analyzeOutcome — showdowns', () => {
  it('names the kicker that decided a pair against a pair', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'As Kd', end: 1010 },
        { id: 'bot', cards: 'Ac Qh', end: 990 },
      ],
      events: [
        post('hero', 5, 'smallBlind'),
        post('bot', 10, 'bigBlind'),
        call('hero'),
        check('bot'),
        ...checkDown('Ad 7c 5h', '3s', '2d', 'bot', 'hero'),
        award('hero', 20),
        { type: 'handEnded' },
      ],
    });
    const outcome = outcomeOf(record);

    expect(outcome.showdown).toBe(true);
    expect(outcome.pots).toEqual([
      {
        amount: 20,
        eligible: ['hero', 'bot'],
        shares: [{ playerId: 'hero', amount: 20 }],
        decidedBy: 'kicker',
        kickerRank: 13,
      },
    ]);
    const hero = outcome.players.find((p) => p.playerId === 'hero');
    expect(hero?.bestHand?.category).toBe('pair');
    expect(ranks(hero?.bestHand?.cards ?? [])).toBe('AAK75');
    expect(hero?.net).toBe(10);
    expect(outcome.explanations.map((m) => m.key)).toEqual([
      'outcome.pot.kicker',
      'outcome.hero.won',
    ]);
    expect(outcome.explanations[0]?.params).toMatchObject({
      kickerRank: 13,
      category: 'pair',
      pot: 'main',
    });
  });

  it('splits a chopped pot and gives the odd chip to the first winner left of the button', () => {
    // Button "a" calls, small blind "b" folds, big blind "c" checks; the board is a royal flush.
    const record = buildRecord({
      heroId: 'a',
      seats: [
        { id: 'a', cards: '2c 3d', end: 1002 },
        { id: 'b', cards: '4c 5d', end: 995 },
        { id: 'c', cards: '6c 7d', end: 1003 },
      ],
      events: [
        post('b', 5, 'smallBlind'),
        post('c', 10, 'bigBlind'),
        call('a'),
        fold('b'),
        check('c'),
        ...checkDown('Ah Kh Qh', 'Jh', 'Th', 'c', 'a'),
        award('c', 8),
        award('a', 7),
        award('c', 5),
        award('a', 5),
        { type: 'handEnded' },
      ],
    });
    // The folded small blind's 5 forms its own layer, so the engine splits two pots: 15 and 10.
    const pots = outcomeOf(record).pots;

    expect(pots.map((p) => p.decidedBy)).toEqual(['tie', 'tie']);
    expect(pots.map((p) => p.shares)).toEqual([
      [
        { playerId: 'c', amount: 8 },
        { playerId: 'a', amount: 7 },
      ],
      [
        { playerId: 'c', amount: 5 },
        { playerId: 'a', amount: 5 },
      ],
    ]);
  });

  it('awards a main pot and a side pot to different players', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'Qc Qd', end: 850 },
        { id: 'short', cards: 'Ac Ad', stack: 50, end: 150 },
        { id: 'big', cards: 'Kc Kd', end: 1050 },
      ],
      events: [
        post('short', 5, 'smallBlind'),
        post('big', 10, 'bigBlind'),
        call('hero'),
        raise('short', 50),
        call('big'),
        call('hero'),
        street('flop', '2c 7d 9h'),
        bet('big', 100),
        call('hero'),
        street('turn', '3s'),
        check('big'),
        check('hero'),
        street('river', '4h'),
        check('big'),
        check('hero'),
        street('showdown'),
        award('short', 150),
        award('big', 200),
        { type: 'handEnded' },
      ],
    });
    const outcome = outcomeOf(record);

    expect(outcome.pots.map((p) => [p.amount, p.shares, p.decidedBy])).toEqual([
      [150, [{ playerId: 'short', amount: 150 }], 'rank'],
      [200, [{ playerId: 'big', amount: 200 }], 'rank'],
    ]);
    expect(outcome.explanations[1]).toMatchObject({
      key: 'outcome.pot.rank',
      params: { pot: 'side' },
    });
    expect(outcome.allIn).toBeNull(); // the hero still had chips and kept betting
  });
});

describe('analyzeOutcome — no showdown', () => {
  it('records who folded to which bet', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'As Kd', end: 970 },
        { id: 'bot', cards: '7c 2h', end: 1030 },
      ],
      events: [
        post('hero', 5, 'smallBlind'),
        post('bot', 10, 'bigBlind'),
        raise('hero', 30),
        call('bot'),
        street('flop', 'Qd 8c 3s'),
        bet('bot', 40),
        fold('hero'),
        award('bot', 60),
        { type: 'handEnded' },
      ],
    });
    const outcome = outcomeOf(record);

    expect(outcome.showdown).toBe(false);
    expect(outcome.players.every((p) => p.bestHand === null)).toBe(true);
    expect(outcome.foldWin).toEqual({
      winnerId: 'bot',
      street: 'flop',
      lastAggression: { playerId: 'bot', amount: 40 },
      foldedPlayerIds: ['hero'],
    });
    // The uncalled 40 comes back to the bettor as its own one-player pot.
    expect(outcome.pots.map((p) => [p.amount, p.decidedBy])).toEqual([
      [60, 'uncontested'],
      [40, 'uncontested'],
    ]);
    expect(outcome.explanations.map((m) => m.key)).toEqual([
      'outcome.foldWin.toBet',
      'outcome.hero.lost',
    ]);
  });
});

describe('analyzeOutcome — all-in EV', () => {
  it('compares the expected result of a preflop all-in with what happened', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'Ac Ad', stack: 100, end: 0 },
        { id: 'bot', cards: 'Kh Ks', end: 1100 },
      ],
      events: [
        post('hero', 5, 'smallBlind'),
        post('bot', 10, 'bigBlind'),
        raise('hero', 100),
        call('bot'),
        street('flop', 'Kc 7d 2s'),
        street('turn', '9h'),
        street('river', '3c'),
        street('showdown'),
        award('bot', 200),
        { type: 'handEnded' },
      ],
    });
    const allIn = outcomeOf(record).allIn;

    expect(allIn?.street).toBe('preflop');
    expect(allIn?.heroEquity).toBeGreaterThan(0.79);
    expect(allIn?.heroEquity).toBeLessThan(0.85);
    // ~0.82 × 200 − 100
    expect(allIn?.expectedNet).toBeGreaterThan(55);
    expect(allIn?.expectedNet).toBeLessThan(70);
    expect(allIn?.actualNet).toBe(-100);
    expect(outcomeOf(record).explanations.map((m) => m.key)).toContain('outcome.allIn.ranBad');
  });
});

/** Plays one complete hand with the real engine and random (legal-ish) actions. */
function playRandomHand(seed: number): HandRecord {
  const rng = createMulberry32(seed);
  const count = 2 + Math.floor(rng.next() * 5);
  const ids = Array.from({ length: count }, (_, i) =>
    toPlayerId(i === 0 ? 'hero' : `p${String(i)}`),
  );
  const base = createInitialState({
    playerIds: ids,
    startingStack: toChips(100),
    blinds: {
      smallBlind: toChips(5),
      bigBlind: toChips(10),
      ante: toChips(rng.next() < 0.3 ? 1 : 0),
    },
    dealerIndex: Math.floor(rng.next() * count),
  });
  // Uneven stacks make side pots common.
  const initial: GameState = {
    ...base,
    players: base.players.map((p) => ({ ...p, stack: toChips(20 + Math.floor(rng.next() * 300)) })),
  };

  const events: EngineEvent[] = [];
  let state = initial;
  const apply = (command: EngineCommand): boolean => {
    const result = reduce(state, command, { rng });
    if (!result.ok) return false;
    state = result.value.state;
    events.push(...result.value.events);
    return true;
  };
  apply({ type: 'startHand' });

  for (let guard = 0; guard < 500 && state.street !== 'idle'; guard++) {
    if (state.street === 'showdown') {
      const hands = new Map<PlayerId, readonly Card[]>(
        state.players.filter((p) => p.status !== 'folded').map((p) => [p.id, p.holeCards]),
      );
      apply({
        type: 'resolveShowdown',
        rankedGroups: rankPlayersForShowdown(hands, state.communityCards),
      });
    } else if (state.toAct.length === 0) {
      apply({ type: 'advanceStreet' });
    } else {
      const actor = state.toAct[0];
      const player = state.players.find((p) => p.id === actor);
      if (!actor || !player) break;
      const owed = state.currentBet - player.committedThisStreet;
      const roll = rng.next();
      const passive: ActionInput = owed > 0 ? { kind: 'call' } : { kind: 'check' };
      const choice: ActionInput =
        roll < 0.15 && owed > 0 ? { kind: 'fold' } : roll < 0.4 ? { kind: 'allIn' } : passive;
      if (!apply({ type: 'playerAction', playerId: actor, action: choice })) {
        apply({ type: 'playerAction', playerId: actor, action: passive });
      }
    }
  }

  const dealt = new Map<PlayerId, readonly Card[]>();
  for (const e of events) if (e.type === 'cardsDealt') dealt.set(e.playerId, e.cards);
  return {
    ...buildRecord({
      seats: [
        { id: 'x', cards: '2c 3c' },
        { id: 'y', cards: '4c 5c' },
      ],
      events: [],
    }),
    heroId: toPlayerId('hero'),
    seed,
    blinds: initial.blinds,
    dealerIndex: initial.dealerIndex,
    players: initial.players.map((p, seat) => ({
      id: p.id,
      seat,
      botDifficulty: p.id === 'hero' ? null : ('easy' as const),
      startingStack: p.stack,
      endingStack: state.players[seat]?.stack ?? p.stack,
      holeCards: dealt.get(p.id) ?? [],
    })),
    board: events.flatMap((e) => (e.type === 'streetAdvanced' ? e.communityCards : [])),
    events,
  };
}

describe('analyzeOutcome — against hands played by the engine', () => {
  it('splits every pot exactly as the engine paid it, and chips are conserved', () => {
    fc.assert(
      fc.property(fc.integer({ min: 1, max: 2 ** 31 }), (seed) => {
        const record = playRandomHand(seed);
        expect(record.events.at(-1)?.type).toBe('handEnded');
        const outcome = outcomeOf(record);

        const paid = new Map<string, number>();
        for (const e of record.events) {
          if (e.type === 'potAwarded') paid.set(e.playerId, (paid.get(e.playerId) ?? 0) + e.amount);
        }
        const shared = new Map<string, number>();
        for (const pot of outcome.pots) {
          for (const s of pot.shares)
            shared.set(s.playerId, (shared.get(s.playerId) ?? 0) + s.amount);
        }
        expect(shared).toEqual(paid);
        expect(outcome.players.reduce((sum, p) => sum + p.net, 0)).toBe(0);
        if (outcome.allIn) {
          expect(outcome.allIn.heroEquity).toBeGreaterThanOrEqual(0);
          expect(outcome.allIn.heroEquity).toBeLessThanOrEqual(1);
        }
      }),
      { numRuns: 300 },
    );
  });
});
