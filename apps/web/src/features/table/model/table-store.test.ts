import { afterEach, describe, expect, it } from 'vitest';
import { createMulberry32 } from '@poker/engine';
import type { TableConfig } from '@poker/protocol';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';
import { useTableStore } from './table-store.js';

function baseConfig(overrides: Partial<TableConfig> = {}): TableConfig {
  return {
    schemaVersion: 1,
    botCount: 1,
    startingStack: 1000,
    smallBlind: 5,
    bigBlind: 10,
    ante: 0,
    isTournament: false,
    botDifficulty: 'easy',
    ...overrides,
  };
}

afterEach(async () => {
  await useTableStore.getState().disconnect();
});

describe('useTableStore — connect', () => {
  it('reaches connected status with an initial snapshot of every seat', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(1) });
    await useTableStore
      .getState()
      .connect(gateway, baseConfig({ botCount: 2, startingStack: 500 }));

    const state = useTableStore.getState();
    expect(state.status).toBe('connected');
    expect(state.session).not.toBeNull();
    expect(state.snapshot?.street).toBe('idle');
    expect(state.snapshot?.players).toHaveLength(3);
    expect(state.snapshot?.players.every((p) => p.stack === 500)).toBe(true);
  });
});

describe('useTableStore — startHand / submitAction', () => {
  it('starts a hand and lets the local player act on their own turn', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    await useTableStore.getState().connect(gateway, baseConfig({ botCount: 1 }));
    const localPlayerId = useTableStore.getState().session?.localPlayerId;

    await useTableStore.getState().startHand();
    const afterStart = useTableStore.getState();
    expect(afterStart.snapshot?.street).toBe('preflop');
    // Heads-up, dealerIndex 0 — the local player is the button and acts first.
    expect(afterStart.snapshot?.actingPlayerId).toBe(localPlayerId);
    expect(afterStart.error).toBeNull();

    const potBeforeCall = afterStart.snapshot?.pot ?? 0;
    await useTableStore.getState().submitAction({ kind: 'call' });
    const afterCall = useTableStore.getState();
    expect(afterCall.error).toBeNull();
    // The bot may re-raise, putting the action straight back on the local
    // player — so only assert that the call itself went through and the
    // simulation progressed, not who specifically acts next.
    expect(afterCall.snapshot?.pot ?? 0).toBeGreaterThan(potBeforeCall);
  });

  it('surfaces an engine error without crashing when the action is illegal', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    await useTableStore.getState().connect(gateway, baseConfig({ botCount: 1 }));
    await useTableStore.getState().startHand();

    // Facing the big blind, checking is illegal.
    await useTableStore.getState().submitAction({ kind: 'check' });

    expect(useTableStore.getState().error).not.toBeNull();
  });

  it('accumulates server events into the log', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    await useTableStore.getState().connect(gateway, baseConfig({ botCount: 1 }));
    await useTableStore.getState().startHand();

    const types = useTableStore.getState().log.map((e) => e.type);
    expect(types).toContain('handStarted');
    expect(types).toContain('cardsDealt');
    expect(types).toContain('stateChanged');
  });
});

describe('useTableStore — disconnect', () => {
  it('resets to the idle state', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    await useTableStore.getState().connect(gateway, baseConfig({ botCount: 1 }));
    await useTableStore.getState().startHand();

    await useTableStore.getState().disconnect();

    const state = useTableStore.getState();
    expect(state.status).toBe('idle');
    expect(state.gateway).toBeNull();
    expect(state.session).toBeNull();
    expect(state.snapshot).toBeNull();
    expect(state.log).toHaveLength(0);
  });
});
