import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createInitialState, reduce, type EngineDeps } from './reduce.js';
import { createMulberry32, toChips, toPlayerId, type Result } from './types.js';
import type { GameState } from './state.js';
import type { ActionInput } from './commands.js';
import { rankPlayersForShowdown } from './showdown.js';

const deps: EngineDeps = { rng: createMulberry32(42) };

function expectOk<T, E>(result: Result<T, E>): T {
  if (!result.ok) {
    throw new Error(`Expected ok result, got error: ${JSON.stringify(result.error)}`);
  }
  return result.value;
}

// `committedThisStreet` chips already live in `state.pot` once posted — only
// `pot + stacks` gives the true total, adding committedThisStreet would double-count.
function totalChips(state: GameState): number {
  return state.pot + state.players.reduce((sum, p) => sum + p.stack, 0);
}

describe('reduce — startHand', () => {
  it('deals hole cards and posts blinds heads-up, dealer acts first preflop', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const initial = createInitialState({
      playerIds: [alice, bob],
      startingStack: toChips(1000),
      blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
      dealerIndex: 0,
    });

    const { state, events } = expectOk(reduce(initial, { type: 'startHand' }, deps));

    expect(state.street).toBe('preflop');
    expect(state.pot).toBe(15);
    expect(state.currentBet).toBe(10);
    expect(state.toAct).toEqual([alice, bob]);
    expect(state.actingPlayerId).toBe(alice);

    const [sb, bb] = state.players;
    expect(sb?.stack).toBe(995);
    expect(sb?.holeCards).toHaveLength(2);
    expect(bb?.stack).toBe(990);
    expect(bb?.holeCards).toHaveLength(2);

    expect(events.map((e) => e.type)).toEqual([
      'handStarted',
      'blindsPosted',
      'blindsPosted',
      'cardsDealt',
      'cardsDealt',
    ]);
  });

  it('rejects starting a hand that is already in progress', () => {
    const initial = createInitialState({
      playerIds: [toPlayerId('a'), toPlayerId('b')],
      startingStack: toChips(1000),
      blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
    });
    const { state } = expectOk(reduce(initial, { type: 'startHand' }, deps));
    const result = reduce(state, { type: 'startHand' }, deps);
    expect(result).toEqual({ ok: false, error: { code: 'handAlreadyInProgress' } });
  });
});

describe('reduce — playerAction', () => {
  function startedHeadsUp(): {
    state: GameState;
    alice: ReturnType<typeof toPlayerId>;
    bob: ReturnType<typeof toPlayerId>;
  } {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const initial = createInitialState({
      playerIds: [alice, bob],
      startingStack: toChips(1000),
      blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
      dealerIndex: 0,
    });
    const { state } = expectOk(reduce(initial, { type: 'startHand' }, deps));
    return { state, alice, bob };
  }

  it('rejects an action from a player who is not on the clock', () => {
    const { state, bob } = startedHeadsUp();
    const result = reduce(
      state,
      { type: 'playerAction', playerId: bob, action: { kind: 'call' } },
      deps,
    );
    expect(result.ok).toBe(false);
  });

  it('rejects check when facing a bet', () => {
    const { state, alice } = startedHeadsUp();
    const result = reduce(
      state,
      { type: 'playerAction', playerId: alice, action: { kind: 'check' } },
      deps,
    );
    expect(result).toEqual({
      ok: false,
      error: { code: 'illegalAction', reason: 'Cannot check facing a bet' },
    });
  });

  it('closes the betting round once SB calls and BB checks the option', () => {
    const { state, alice, bob } = startedHeadsUp();
    const afterCall = expectOk(
      reduce(state, { type: 'playerAction', playerId: alice, action: { kind: 'call' } }, deps),
    );
    expect(afterCall.state.pot).toBe(20);
    expect(afterCall.state.toAct).toEqual([bob]);

    const afterCheck = expectOk(
      reduce(
        afterCall.state,
        { type: 'playerAction', playerId: bob, action: { kind: 'check' } },
        deps,
      ),
    );
    expect(afterCheck.state.toAct).toEqual([]);
    expect(afterCheck.state.street).toBe('preflop');
  });

  it('enforces the minimum raise size', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const carol = toPlayerId('carol');
    const dave = toPlayerId('dave');
    const initial = createInitialState({
      playerIds: [alice, bob, carol, dave],
      startingStack: toChips(1000),
      blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
      dealerIndex: 0,
    });
    const { state } = expectOk(reduce(initial, { type: 'startHand' }, deps));
    // alice = dealer (seat 0), bob = SB, carol = BB, dave = UTG and first to act.
    expect(state.toAct[0]).toBe(dave);

    const tooSmall = reduce(
      state,
      { type: 'playerAction', playerId: dave, action: { kind: 'raise', amount: toChips(15) } },
      deps,
    );
    expect(tooSmall.ok).toBe(false);

    const legal = expectOk(
      reduce(
        state,
        { type: 'playerAction', playerId: dave, action: { kind: 'raise', amount: toChips(30) } },
        deps,
      ),
    );
    expect(legal.state.currentBet).toBe(30);
    expect(legal.state.minRaise).toBe(20);
    expect(legal.state.toAct).toEqual([alice, bob, carol]);
  });

  it('awards the pot immediately when every other player folds', () => {
    const { state, alice, bob } = startedHeadsUp();
    const { state: afterFold, events } = expectOk(
      reduce(state, { type: 'playerAction', playerId: alice, action: { kind: 'fold' } }, deps),
    );

    expect(afterFold.street).toBe('idle');
    expect(afterFold.pot).toBe(0);
    const winner = afterFold.players.find((p) => p.id === bob);
    expect(winner?.stack).toBe(1005);
    expect(events.map((e) => e.type)).toContain('potAwarded');
    expect(events.map((e) => e.type)).toContain('handEnded');
  });
});

describe('reduce — advanceStreet', () => {
  it('deals the flop and resets street commitments once betting is closed', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const initial = createInitialState({
      playerIds: [alice, bob],
      startingStack: toChips(1000),
      blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
      dealerIndex: 0,
    });
    const started = expectOk(reduce(initial, { type: 'startHand' }, deps));
    const afterCall = expectOk(
      reduce(
        started.state,
        { type: 'playerAction', playerId: alice, action: { kind: 'call' } },
        deps,
      ),
    );
    const afterCheck = expectOk(
      reduce(
        afterCall.state,
        { type: 'playerAction', playerId: bob, action: { kind: 'check' } },
        deps,
      ),
    );

    const { state, events } = expectOk(reduce(afterCheck.state, { type: 'advanceStreet' }, deps));

    expect(state.street).toBe('flop');
    expect(state.communityCards).toHaveLength(3);
    expect(state.currentBet).toBe(0);
    expect(state.players.every((p) => p.committedThisStreet === 0)).toBe(true);
    // Heads-up: BB acts first post-flop.
    expect(state.toAct).toEqual([bob, alice]);
    expect(events).toEqual([
      { type: 'streetAdvanced', street: 'flop', communityCards: state.communityCards },
    ]);
  });

  it('rejects advancing while the betting round is still open', () => {
    const { state } = expectOk(
      reduce(
        createInitialState({
          playerIds: [toPlayerId('a'), toPlayerId('b')],
          startingStack: toChips(1000),
          blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
        }),
        { type: 'startHand' },
        deps,
      ),
    );
    const result = reduce(state, { type: 'advanceStreet' }, deps);
    expect(result).toEqual({ ok: false, error: { code: 'bettingRoundNotComplete' } });
  });
});

describe('reduce — resolveShowdown (side pots)', () => {
  it('splits a main pot and a side pot: short stack wins the main pot, the side pot goes to the bigger stacks', () => {
    const alice = toPlayerId('alice'); // dealer, seat 0
    const bob = toPlayerId('bob'); // SB, seat 1, short stack
    const carol = toPlayerId('carol'); // BB, seat 2

    let state = expectOk(
      reduce(
        createInitialState({
          playerIds: [alice, bob, carol],
          startingStack: toChips(1000),
          blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
          dealerIndex: 0,
        }),
        { type: 'startHand' },
        deps,
      ),
    ).state;
    // Give bob a short stack so he goes all-in for less than the others commit.
    state = {
      ...state,
      players: state.players.map((p) => (p.id === bob ? { ...p, stack: toChips(45) } : p)),
    };

    const step = (
      current: GameState,
      playerId: ReturnType<typeof toPlayerId>,
      action: ActionInput,
    ): GameState =>
      expectOk(reduce(current, { type: 'playerAction', playerId, action }, deps)).state;

    state = step(state, alice, { kind: 'raise', amount: toChips(50) });
    state = step(state, bob, { kind: 'allIn' });
    state = step(state, carol, { kind: 'call' });
    expect(state.pot).toBe(150);

    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // -> flop
    expect(state.street).toBe('flop');

    state = step(state, carol, { kind: 'bet', amount: toChips(100) });
    state = step(state, alice, { kind: 'call' });
    expect(state.pot).toBe(350);

    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // -> turn
    state = step(state, carol, { kind: 'check' });
    state = step(state, alice, { kind: 'check' });

    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // -> river
    state = step(state, carol, { kind: 'check' });
    state = step(state, alice, { kind: 'check' });

    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // -> showdown
    expect(state.street).toBe('showdown');
    expect(state.communityCards).toHaveLength(5);

    // bob's all-in hand beats everyone; alice and carol tie for the side pot.
    const { state: final, events } = expectOk(
      reduce(state, { type: 'resolveShowdown', rankedGroups: [[bob], [alice, carol]] }, deps),
    );

    expect(final.street).toBe('idle');
    expect(final.pot).toBe(0);
    expect(final.players.find((p) => p.id === bob)?.stack).toBe(150); // wins the 150 main pot outright
    expect(final.players.find((p) => p.id === alice)?.stack).toBe(950); // 850 left + 100 side-pot half
    expect(final.players.find((p) => p.id === carol)?.stack).toBe(950); // 850 left + 100 side-pot half

    const potAwardedTotal = events
      .filter((e) => e.type === 'potAwarded')
      .reduce((sum, e) => sum + e.amount, 0);
    expect(potAwardedTotal).toBe(350);
    expect(events.at(-1)).toEqual({ type: 'handEnded' });
  });

  it('rejects resolving a showdown that has not been reached', () => {
    const { state } = expectOk(
      reduce(
        createInitialState({
          playerIds: [toPlayerId('a'), toPlayerId('b')],
          startingStack: toChips(1000),
          blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
        }),
        { type: 'startHand' },
        deps,
      ),
    );
    const result = reduce(state, { type: 'resolveShowdown', rankedGroups: [] }, deps);
    expect(result).toEqual({ ok: false, error: { code: 'notAtShowdown' } });
  });
});

describe('integration — hand evaluator feeds resolveShowdown', () => {
  it('runs a full hand to showdown and pays only the winning group', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');

    let state = expectOk(
      reduce(
        createInitialState({
          playerIds: [alice, bob],
          startingStack: toChips(1000),
          blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
          dealerIndex: 0,
        }),
        { type: 'startHand' },
        deps,
      ),
    ).state;

    const step = (
      current: GameState,
      playerId: ReturnType<typeof toPlayerId>,
      action: ActionInput,
    ): GameState =>
      expectOk(reduce(current, { type: 'playerAction', playerId, action }, deps)).state;

    state = step(state, alice, { kind: 'call' });
    state = step(state, bob, { kind: 'check' });
    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // flop
    state = step(state, bob, { kind: 'check' });
    state = step(state, alice, { kind: 'check' });
    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // turn
    state = step(state, bob, { kind: 'check' });
    state = step(state, alice, { kind: 'check' });
    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // river
    state = step(state, bob, { kind: 'check' });
    state = step(state, alice, { kind: 'check' });
    state = expectOk(reduce(state, { type: 'advanceStreet' }, deps)).state; // showdown

    expect(state.street).toBe('showdown');
    expect(state.communityCards).toHaveLength(5);

    const hands = new Map(state.players.map((p) => [p.id, p.holeCards] as const));
    const rankedGroups = rankPlayersForShowdown(hands, state.communityCards);
    const preShowdownStacks = new Map(state.players.map((p) => [p.id, p.stack] as const));
    const potBefore = state.pot;

    const { state: final } = expectOk(
      reduce(state, { type: 'resolveShowdown', rankedGroups }, deps),
    );

    expect(final.street).toBe('idle');
    expect(final.pot).toBe(0);

    const totalBefore =
      potBefore + Array.from(preShowdownStacks.values()).reduce((sum, v) => sum + v, 0);
    const totalAfter = final.players.reduce((sum, p) => sum + p.stack, 0);
    expect(totalAfter).toBe(totalBefore);

    // Anyone in a strictly weaker group than the winner must not have gained chips.
    if (rankedGroups.length > 1) {
      const lastGroup = rankedGroups[rankedGroups.length - 1] ?? [];
      for (const loserId of lastGroup) {
        const before = preShowdownStacks.get(loserId) ?? 0;
        const after = final.players.find((p) => p.id === loserId)?.stack ?? 0;
        expect(after - before).toBe(0);
      }
    }
  });
});

describe('reduce — chip conservation property', () => {
  it('never creates or destroys chips across startHand + fold', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 2 ** 32 - 1 }),
        fc.integer({ min: 20, max: 10_000 }),
        (seed, startingStack) => {
          const alice = toPlayerId('alice');
          const bob = toPlayerId('bob');
          const initial = createInitialState({
            playerIds: [alice, bob],
            startingStack: toChips(startingStack),
            blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
          });
          const before = totalChips(initial);

          const started = expectOk(
            reduce(initial, { type: 'startHand' }, { rng: createMulberry32(seed) }),
          );
          expect(totalChips(started.state)).toBe(before);

          const folded = expectOk(
            reduce(
              started.state,
              { type: 'playerAction', playerId: alice, action: { kind: 'fold' } },
              { rng: createMulberry32(seed) },
            ),
          );
          expect(totalChips(folded.state)).toBe(before);
        },
      ),
    );
  });
});
