import { afterEach, describe, expect, it } from 'vitest';
import { createMulberry32 } from '@poker/engine';
import type { ProjectedState, TableConfig } from '@poker/protocol';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';
import { useTableStore } from './table-store.js';
import { withShowdownReveal } from './showdown-reveal.js';

const config: TableConfig = {
  schemaVersion: 1,
  botCount: 1,
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  isTournament: false,
  botDifficulty: 'beginner',
};

afterEach(async () => {
  await useTableStore.getState().disconnect();
});

const card = { rank: 'A', suit: 'spades' } as unknown as ProjectedState['communityCards'][number];

function state(overrides: Partial<ProjectedState>): ProjectedState {
  return {
    street: 'idle',
    handNumber: 3,
    communityCards: [],
    players: [
      { id: 'hero', holeCards: [card], stack: 10 },
      { id: 'bot', holeCards: null, stack: 20 },
    ],
    ...overrides,
  } as unknown as ProjectedState;
}

describe('withShowdownReveal', () => {
  const showdown = state({
    street: 'showdown',
    communityCards: [card, card, card, card, card],
    players: state({}).players.map((p) => ({ ...p, holeCards: [card], stack: 0 as ProjectedState['pot'] })),
  });

  it('keeps the shown cards and board between hands, with the paid-out stacks', () => {
    const shown = withShowdownReveal(state({}), showdown);
    expect(shown.communityCards).toHaveLength(5);
    expect(shown.players.map((p) => p.holeCards?.length)).toEqual([1, 1]);
    expect(shown.players.map((p) => p.stack)).toEqual([10, 20]);
  });

  it('forgets them once the next hand starts or without a showdown', () => {
    const next = state({ street: 'preflop', handNumber: 4 });
    expect(withShowdownReveal(next, showdown)).toBe(next);
    const idle = state({});
    expect(withShowdownReveal(idle, null)).toBe(idle);
    expect(withShowdownReveal(state({ handNumber: 2 }), showdown).players[1]?.holeCards).toBeNull();
  });
});

describe('table store — after a showdown', () => {
  it("leaves the opponents' cards and the board on the table until the next deal", async () => {
    await useTableStore
      .getState()
      .connect(new LocalGameGateway({ rng: createMulberry32(5) }), config);

    // Shove until a hand goes to showdown (the bot may fold some of them).
    const heroId = useTableStore.getState().session?.localPlayerId;
    for (let hand = 0; hand < 50 && useTableStore.getState().showdown === null; hand++) {
      await useTableStore.getState().startHand();
      while (useTableStore.getState().snapshot?.actingPlayerId === heroId) {
        await useTableStore.getState().submitAction({ kind: 'allIn' });
      }
      const s = useTableStore.getState();
      if ((s.snapshot?.players.filter((p) => p.stack > 0).length ?? 0) < 2) break;
    }

    const after = useTableStore.getState();
    expect(after.showdown).not.toBeNull();
    expect(after.snapshot?.street).toBe('idle');
    const viewer = after.snapshot?.viewerId;
    // The engine's own projection hides them again…
    expect(after.snapshot?.players.find((p) => p.id !== viewer)?.holeCards).toBeNull();
    // …but the table still shows what was revealed.
    expect(after.displaySnapshot?.players.find((p) => p.id !== viewer)?.holeCards).toHaveLength(2);
    expect(after.displaySnapshot?.communityCards).toHaveLength(5);
  });
});
