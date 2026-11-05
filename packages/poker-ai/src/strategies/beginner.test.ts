import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  createInitialState,
  createMulberry32,
  reduce,
  toChips,
  toPlayerId,
  type EngineDeps,
  type Result,
  type Rng,
} from '@poker/engine';
import { beginnerStrategy } from './beginner.js';
import { toPlayerView } from '../player-view.js';
import { sampleView } from '../test-view.js';

function fixedRng(value: number): Rng {
  return { next: () => value };
}

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe('beginnerStrategy — checking is free', () => {
  it('checks when the random roll lands above raiseFrequency', () => {
    const view = sampleView({ toCall: toChips(0) });
    const action = beginnerStrategy.decide(view, { difficulty: 'beginner', rng: fixedRng(0.99) });
    expect(action).toEqual({ kind: 'check' });
  });

  it('occasionally opens with the minimum legal bet instead of checking', () => {
    const view = sampleView({ toCall: toChips(0), currentBet: toChips(0) });
    const action = beginnerStrategy.decide(view, { difficulty: 'beginner', rng: fixedRng(0.01) });
    expect(action).toEqual({ kind: 'bet', amount: 10 });
  });
});

describe('beginnerStrategy — facing a bet', () => {
  it('mostly calls', () => {
    const view = sampleView({ toCall: toChips(20), currentBet: toChips(20) });
    const action = beginnerStrategy.decide(view, { difficulty: 'beginner', rng: fixedRng(0.5) });
    expect(action).toEqual({ kind: 'call' });
  });

  it('occasionally folds — the "intentional mistake"', () => {
    const view = sampleView({ toCall: toChips(20), currentBet: toChips(20) });
    const action = beginnerStrategy.decide(view, { difficulty: 'beginner', rng: fixedRng(0.01) });
    expect(action).toEqual({ kind: 'fold' });
  });

  it('occasionally raises instead of calling', () => {
    const view = sampleView({
      toCall: toChips(20),
      currentBet: toChips(20),
      minRaise: toChips(20),
    });
    const action = beginnerStrategy.decide(view, { difficulty: 'beginner', rng: fixedRng(0.1) });
    expect(action).toEqual({ kind: 'raise', amount: 40 });
  });

  it('goes all-in rather than folding when it cannot afford the full call', () => {
    const view = sampleView({ toCall: toChips(500), stack: toChips(100) });
    const action = beginnerStrategy.decide(view, { difficulty: 'beginner', rng: fixedRng(0.01) });
    expect(action).toEqual({ kind: 'allIn' });
  });
});

describe('beginnerStrategy — never performs an illegal action', () => {
  it('plays a full betting round of randomly generated hands without the engine rejecting any action', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 6 }),
        fc.integer({ min: 20, max: 10_000 }),
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        (playerCount, startingStack, dealSeed, decisionSeed) => {
          const playerIds = Array.from({ length: playerCount }, (_, i) =>
            toPlayerId(`p${String(i)}`),
          );
          const deps: EngineDeps = { rng: createMulberry32(dealSeed) };
          const decisionRng = createMulberry32(decisionSeed);

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
            const action = beginnerStrategy.decide(view, {
              difficulty: 'beginner',
              rng: decisionRng,
            });
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
