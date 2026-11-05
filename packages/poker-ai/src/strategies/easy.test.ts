import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createInitialState,
  createMulberry32,
  reduce,
  toChips,
  toPlayerId,
  type Card,
  type EngineDeps,
  type Result,
} from '@poker/engine';
import { easyStrategy } from './easy.js';
import { toPlayerView } from '../player-view.js';
import { sampleView } from '../test-view.js';

const noopRng = createMulberry32(0);
const ctx = { difficulty: 'easy' as const, rng: noopRng };

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

const aces: readonly Card[] = [
  { rank: 'A', suit: 'spades' },
  { rank: 'A', suit: 'hearts' },
];
const trash: readonly Card[] = [
  { rank: '7', suit: 'spades' },
  { rank: '2', suit: 'hearts' },
];

describe('easyStrategy — preflop', () => {
  it('opens with a raise on a premium hand', () => {
    const view = sampleView({ holeCards: aces, toCall: toChips(0) });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'bet', amount: 10 });
  });

  it('raises a premium hand facing a bet instead of just calling', () => {
    const view = sampleView({ holeCards: aces, toCall: toChips(20), currentBet: toChips(20) });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'raise', amount: 30 });
  });

  it('stops re-raising once the bet reaches the cap and calls instead', () => {
    const view = sampleView({ holeCards: aces, toCall: toChips(40), currentBet: toChips(40) });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'call' });
  });

  it('folds trash facing a bet', () => {
    const view = sampleView({ holeCards: trash, toCall: toChips(20), currentBet: toChips(20) });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'fold' });
  });

  it('checks trash for free rather than folding', () => {
    const view = sampleView({ holeCards: trash, toCall: toChips(0) });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'check' });
  });
});

describe('easyStrategy — postflop (pair or better continues)', () => {
  const board: readonly Card[] = [
    { rank: '9', suit: 'diamonds' },
    { rank: 'J', suit: 'clubs' },
    { rank: 'A', suit: 'clubs' },
    { rank: '3', suit: 'spades' },
    { rank: '7', suit: 'diamonds' },
  ];

  it('folds a busted high card to a bet', () => {
    const holeCards: readonly Card[] = [
      { rank: '2', suit: 'clubs' },
      { rank: '5', suit: 'hearts' },
    ];
    const view = sampleView({
      holeCards,
      communityCards: board,
      toCall: toChips(20),
      currentBet: toChips(20),
    });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'fold' });
  });

  it('calls with just a pair, does not raise', () => {
    const holeCards: readonly Card[] = [
      { rank: '2', suit: 'clubs' },
      { rank: '2', suit: 'hearts' },
    ];
    const view = sampleView({
      holeCards,
      communityCards: board,
      toCall: toChips(20),
      currentBet: toChips(20),
    });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'call' });
  });

  it('raises for value with two pair or better', () => {
    const twoPairBoard: readonly Card[] = [
      { rank: '9', suit: 'diamonds' },
      { rank: '9', suit: 'clubs' },
      { rank: 'A', suit: 'clubs' },
      { rank: '3', suit: 'spades' },
      { rank: '7', suit: 'diamonds' },
    ];
    const holeCards: readonly Card[] = [
      { rank: '2', suit: 'clubs' },
      { rank: '2', suit: 'hearts' },
    ];
    const view = sampleView({
      holeCards,
      communityCards: twoPairBoard,
      toCall: toChips(20),
      currentBet: toChips(20),
      minRaise: toChips(20),
    });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'raise', amount: 40 });
  });

  it('bets a strong hand for value when checked to', () => {
    const tripsBoard: readonly Card[] = [
      { rank: '2', suit: 'diamonds' },
      { rank: '9', suit: 'clubs' },
      { rank: 'A', suit: 'clubs' },
      { rank: '3', suit: 'spades' },
      { rank: '7', suit: 'diamonds' },
    ];
    const holeCards: readonly Card[] = [
      { rank: '2', suit: 'clubs' },
      { rank: '2', suit: 'hearts' },
    ];
    const view = sampleView({ holeCards, communityCards: tripsBoard, toCall: toChips(0) });
    expect(easyStrategy.decide(view, ctx)).toEqual({ kind: 'bet', amount: 10 });
  });
});

describe('easyStrategy — never performs an illegal action', () => {
  it('plays a full betting round of randomly generated hands without the engine rejecting any action', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 20, max: 10_000 }),
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        (playerCount, startingStack, dealSeed) => {
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            toPlayerId(`p${String(i)}`),
          );
          const deps: EngineDeps = { rng: createMulberry32(dealSeed) };

          let state = expectOk(
            reduce(
              createInitialState({
                playerIds,
                startingStack: toChips(startingStack),
                blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
              }),
              { type: 'startHand' },
              deps,
            ),
          ).state;

          for (let i = 0; i < playerCount * 4 && state.toAct.length > 0; i++) {
            const actingId = state.toAct[0];
            if (!actingId) {
              break;
            }
            const view = toPlayerView(state, actingId);
            const action = easyStrategy.decide(view, ctx);
            const result = reduce(
              state,
              { type: 'playerAction', playerId: actingId, action },
              deps,
            );
            expect(result.ok).toBe(true);
            state = expectOk(result).state;
          }
        },
      ),
    );
  });
});
