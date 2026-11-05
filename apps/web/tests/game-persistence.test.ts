import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createMulberry32 } from '@poker/engine';
import type { ProjectedPlayer, ProjectedState, ServerEvent, TableConfig } from '@poker/protocol';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';
import { LocalGameSaveRepository } from '@/infrastructure/local-game-save-repository';
import { useTableStore } from '@/features/table/model/table-store';

const config: TableConfig = {
  schemaVersion: 1,
  botCount: 2,
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  isTournament: false,
  botDifficulty: 'easy',
};

function lastSnapshot(gateway: LocalGameGateway): () => ServerEvent | undefined {
  let last: ServerEvent | undefined;
  gateway.subscribe((event) => {
    if (event.type === 'stateChanged') last = event;
  });
  return () => last;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(async () => {
  await useTableStore.getState().disconnect();
  localStorage.clear();
});

describe('game persistence', () => {
  it('resumes a saved hand after a reconnect with the same config', async () => {
    const first = new LocalGameGateway({
      rng: createMulberry32(7),
      saveRepository: new LocalGameSaveRepository(),
    });
    await first.connect(config);
    await first.send({ type: 'startHand' });
    await first.disconnect();

    const second = new LocalGameGateway({
      rng: createMulberry32(99),
      saveRepository: new LocalGameSaveRepository(),
    });
    const snapshot = lastSnapshot(second);
    await second.connect(config);

    const event = snapshot();
    expect(event?.type === 'stateChanged' && event.snapshot.handNumber).toBe(1);
  });

  it('starts a fresh game when the config changed', async () => {
    const first = new LocalGameGateway({
      rng: createMulberry32(7),
      saveRepository: new LocalGameSaveRepository(),
    });
    await first.connect(config);
    await first.send({ type: 'startHand' });
    await first.disconnect();

    const second = new LocalGameGateway({
      rng: createMulberry32(7),
      saveRepository: new LocalGameSaveRepository(),
    });
    const snapshot = lastSnapshot(second);
    await second.connect({ ...config, botCount: 3 });

    const event = snapshot();
    expect(event?.type === 'stateChanged' && event.snapshot.handNumber).toBe(0);
  });

  it('starts a fresh game after the human busts while bots still have chips', async () => {
    const repository = new LocalGameSaveRepository();
    const gateway = new LocalGameGateway({ rng: createMulberry32(4), saveRepository: repository });
    let snapshot: ProjectedState | null = null;
    gateway.subscribe((event) => {
      if (event.type === 'stateChanged') snapshot = event.snapshot;
    });
    const busting = { ...config, botCount: 3, startingStack: 100 };
    const session = await gateway.connect(busting);
    const hero = (): ProjectedPlayer | undefined =>
      (snapshot as ProjectedState | null)?.players.find((p) => p.id === session.localPlayerId);

    // Shove every hand until the human is out.
    for (let hand = 0; hand < 100 && (hero()?.stack ?? 0) > 0; hand++) {
      await gateway.send({ type: 'startHand' });
      for (let turn = 0; turn < 20; turn++) {
        const current = snapshot as ProjectedState | null;
        if (!current || current.street === 'idle') break;
        if (current.actingPlayerId !== session.localPlayerId) break;
        await gateway.send({
          type: 'playerAction',
          playerId: session.localPlayerId,
          action: { kind: 'allIn' },
        });
      }
    }
    const busted = snapshot as ProjectedState | null;
    expect(hero()?.stack).toBe(0);
    // The bots can still play on — this is the case that used to keep the save.
    expect(busted?.players.filter((p) => p.stack > 0).length).toBeGreaterThan(1);
    expect(repository.load()).toBeNull();

    // "New game" reconnects with the same config.
    await gateway.connect(busting);
    const fresh = snapshot as ProjectedState | null;
    expect(fresh?.handNumber).toBe(0);
    expect(fresh?.players.every((p) => p.stack === 100)).toBe(true);
  });

  it('ignores a corrupted save', () => {
    localStorage.setItem('texas-holdem:saved-game', '{"nope":true}');
    expect(new LocalGameSaveRepository().load()).toBeNull();
  });
});

describe('useTableStore — ensureConnected', () => {
  it('keeps the running game when called again with the same gateway and config', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(3) });
    await useTableStore.getState().ensureConnected(gateway, config);
    await useTableStore.getState().startHand();
    const before = useTableStore.getState().snapshot?.handNumber;

    await useTableStore.getState().ensureConnected(gateway, { ...config });

    expect(before).toBe(1);
    expect(useTableStore.getState().snapshot?.handNumber).toBe(1);
  });

  it('starts a new game when the config changed', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(3) });
    await useTableStore.getState().ensureConnected(gateway, config);
    await useTableStore.getState().startHand();

    await useTableStore.getState().ensureConnected(gateway, { ...config, botCount: 3 });

    expect(useTableStore.getState().snapshot?.handNumber).toBe(0);
  });
});
