import {
  createInitialState,
  createMulberry32,
  rankPlayersForShowdown,
  reduce,
  toChips,
  toPlayerId,
  type EngineCommand,
  type GameState,
  type PlayerId,
} from '@poker/engine';
import type { Difficulty } from './index.js';
import { decideBotAction } from './decide.js';
import { OpponentModel } from './opponent-model.js';
import { toPlayerView } from './player-view.js';
import { rangeStepFor } from './public-history.js';
import type { RangeStep } from './ranges/narrow-range.js';

export interface TableResult {
  /** Chips won or lost per seat, rebuys accounted for. */
  readonly net: readonly number[];
  readonly hands: number;
  readonly decisions: number;
}

/**
 * Plays bots against each other through the real engine — a cash game where
 * a busted seat rebuys. Throws on any illegal action, so it doubles as a
 * legality check. Test-only.
 */
export function playTable(options: {
  readonly difficulties: readonly Difficulty[];
  readonly hands: number;
  readonly seed: number;
  readonly stack?: number;
  readonly isTournament?: boolean;
}): TableResult {
  const stack = options.stack ?? 1000;
  const ids = options.difficulties.map((_, i) => toPlayerId(`seat-${String(i)}`));
  const levelOf = new Map(ids.map((id, i) => [id, options.difficulties[i] ?? 'easy'] as const));
  const rng = createMulberry32(options.seed);
  const model = new OpponentModel();
  const buyIns = new Map<PlayerId, number>(ids.map((id) => [id, 1]));
  let state: GameState = createInitialState({
    playerIds: ids,
    startingStack: toChips(stack),
    blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
  });
  let decisions = 0;

  const apply = (command: EngineCommand): ReturnType<typeof reduce> => {
    const result = reduce(state, command, { rng });
    if (!result.ok) {
      throw new Error(
        `Engine rejected ${JSON.stringify(command)}: ${JSON.stringify(result.error)}`,
      );
    }
    state = result.value.state;
    return result;
  };

  let hand = 0;
  for (; hand < options.hands; hand++) {
    // Rebuy busted seats and move the button, as a cash table would.
    state = {
      ...state,
      players: state.players.map((p) => {
        if (p.stack > 0) return p;
        buyIns.set(p.id, (buyIns.get(p.id) ?? 0) + 1);
        return { ...p, stack: toChips(stack) };
      }),
      dealerIndex: hand === 0 ? 0 : (state.dealerIndex + 1) % ids.length,
    };
    apply({ type: 'startHand' });
    const history: RangeStep[] = [];
    const dealtIn = state.players.filter((p) => p.holeCards.length === 2).map((p) => p.id);

    for (let step = 0; step < 500; step++) {
      if (state.street === 'idle') break;
      if (state.street === 'showdown') {
        const hands = new Map(
          state.players.filter((p) => p.status !== 'folded').map((p) => [p.id, p.holeCards]),
        );
        apply({
          type: 'resolveShowdown',
          rankedGroups: rankPlayersForShowdown(hands, state.communityCards),
        });
        continue;
      }
      const actor = state.actingPlayerId;
      if (state.toAct.length === 0 || actor === null) {
        apply({ type: 'advanceStreet' });
        continue;
      }
      const before = state;
      const action = decideBotAction({
        view: toPlayerView(state, actor, history),
        difficulty: levelOf.get(actor) ?? 'easy',
        seed: Math.floor(rng.next() * 2 ** 32) >>> 0,
        opponentStats: model.snapshot(),
        ...(options.isTournament !== undefined ? { isTournament: options.isTournament } : {}),
      });
      decisions++;
      const result = apply({ type: 'playerAction', playerId: actor, action });
      for (const event of result.ok ? result.value.events : []) {
        if (event.type !== 'actionTaken') continue;
        const recorded = rangeStepFor(before, actor, event.action, history);
        if (recorded) history.push(recorded);
      }
    }
    model.recordHand(history, dealtIn);
  }

  return {
    net: ids.map((id) => {
      const final = state.players.find((p) => p.id === id)?.stack ?? 0;
      return final - (buyIns.get(id) ?? 1) * stack;
    }),
    hands: hand,
    decisions,
  };
}
