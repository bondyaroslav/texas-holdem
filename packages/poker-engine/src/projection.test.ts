import { describe, expect, it } from 'vitest';
import { projectStateFor } from './projection.js';
import { createInitialState, reduce } from './reduce.js';
import { createMulberry32, toChips, toPlayerId, type Result } from './types.js';
import type { GameState } from './state.js';

const deps = { rng: createMulberry32(42) };

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

describe('projectStateFor', () => {
  it('shows the viewer their own hole cards before showdown', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const { state } = expectOk(
      reduce(
        createInitialState({
          playerIds: [alice, bob],
          startingStack: toChips(1000),
          blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
        }),
        { type: 'startHand' },
        deps,
      ),
    );

    const projected = projectStateFor(state, alice);
    const aliceView = projected.players.find((p) => p.id === alice);
    expect(aliceView?.holeCards).toHaveLength(2);
  });

  it('hides everyone else hole cards before showdown', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const { state } = expectOk(
      reduce(
        createInitialState({
          playerIds: [alice, bob],
          startingStack: toChips(1000),
          blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
        }),
        { type: 'startHand' },
        deps,
      ),
    );

    const projected = projectStateFor(state, alice);
    const bobView = projected.players.find((p) => p.id === bob);
    expect(bobView?.holeCards).toBeNull();
  });

  it('reveals non-folded hands at showdown but keeps folded hands hidden', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const carol = toPlayerId('carol');
    const initial = createInitialState({
      playerIds: [alice, bob, carol],
      startingStack: toChips(1000),
      blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
      dealerIndex: 0,
    });
    const started = expectOk(reduce(initial, { type: 'startHand' }, deps));
    // alice = dealer/UTG-equivalent for 3-handed, acts first preflop; fold her out.
    const folded = expectOk(
      reduce(
        started.state,
        { type: 'playerAction', playerId: alice, action: { kind: 'fold' } },
        deps,
      ),
    );

    const projected = projectStateFor(folded.state, bob);
    const aliceView = projected.players.find((p) => p.id === alice);
    expect(aliceView?.status).toBe('folded');

    const atShowdown: GameState = { ...folded.state, street: 'showdown' };
    const projectedAtShowdown = projectStateFor(atShowdown, bob);
    const aliceAtShowdown = projectedAtShowdown.players.find((p) => p.id === alice);
    const bobAtShowdown = projectedAtShowdown.players.find((p) => p.id === bob);
    expect(aliceAtShowdown?.holeCards).toBeNull(); // folded — never revealed
    expect(bobAtShowdown?.holeCards).toHaveLength(2); // viewer always sees their own
  });

  it('never leaks the underlying deck', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const { state } = expectOk(
      reduce(
        createInitialState({
          playerIds: [alice, bob],
          startingStack: toChips(1000),
          blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
        }),
        { type: 'startHand' },
        deps,
      ),
    );

    const projected = projectStateFor(state, alice);
    expect('deck' in projected).toBe(false);
  });
});
