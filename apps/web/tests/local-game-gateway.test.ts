import { describe, expect, it, vi } from 'vitest';
import { createMulberry32, toPlayerId } from '@poker/engine';
import type { ServerEvent, TableConfig } from '@poker/protocol';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';

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

describe('LocalGameGateway — connect', () => {
  it('seats the local player alongside one bot per botCount', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(1) });
    const session = await gateway.connect(baseConfig({ botCount: 3 }));

    expect(session.tableId).toBe('local-table');
    expect(session.localPlayerId).toBe(toPlayerId('local-player'));
  });

  it('pushes an initial snapshot with every seated player at the starting stack', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(1) });

    const events: ServerEvent[] = [];
    gateway.subscribe((event) => events.push(event));
    const session = await gateway.connect(baseConfig({ botCount: 3, startingStack: 750 }));

    const snapshot = events.find(
      (e): e is Extract<ServerEvent, { type: 'stateChanged' }> => e.type === 'stateChanged',
    )?.snapshot;
    expect(snapshot?.street).toBe('idle');
    expect(snapshot?.players).toHaveLength(4);
    expect(snapshot?.players.every((p) => p.stack === 750)).toBe(true);
    expect(snapshot?.players.find((p) => p.id === session.localPlayerId)?.holeCards).toEqual([]);
  });
});

describe('LocalGameGateway — send', () => {
  it('rejects commands before connect() is called', async () => {
    const gateway = new LocalGameGateway();
    const result = await gateway.send({ type: 'startHand' });
    expect(result).toEqual({
      ok: false,
      error: { code: 'notConnected', message: expect.any(String) },
    });
  });

  it('deals hole cards and pauses on the local player in heads-up, where they act first', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    const session = await gateway.connect(baseConfig({ botCount: 1 }));

    const events: ServerEvent[] = [];
    gateway.subscribe((event) => events.push(event));

    const result = await gateway.send({ type: 'startHand' });
    expect(result).toEqual({ ok: true });

    expect(events.map((e) => e.type)).toEqual([
      'handStarted',
      'blindsPosted',
      'blindsPosted',
      'cardsDealt',
      'cardsDealt',
      'stateChanged',
    ]);

    // Heads-up with dealerIndex 0 (the local player): the local player is the
    // button and acts first preflop, so no bot turn should have been played yet.
    const actionResult = await gateway.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action: { kind: 'call' },
    });
    expect(actionResult).toEqual({ ok: true });
  });

  it('plays a bot turn automatically before pausing for the local player (3+ players)', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(7) });
    const session = await gateway.connect(baseConfig({ botCount: 3 }));

    const events: ServerEvent[] = [];
    gateway.subscribe((event) => events.push(event));

    await gateway.send({ type: 'startHand' });

    // With 4 seats and the local player on the button, the first to act
    // preflop is the seat after the big blind — a bot, not the local player.
    const actionEventPlayers = events
      .filter((e): e is Extract<ServerEvent, { type: 'actionTaken' }> => e.type === 'actionTaken')
      .map((e) => e.playerId);
    expect(actionEventPlayers.length).toBeGreaterThan(0);
    expect(actionEventPlayers.every((id) => id !== session.localPlayerId)).toBe(true);

    // It really is the local player's turn now — the engine accepts their action.
    const result = await gateway.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action: { kind: 'fold' },
    });
    expect(result).toEqual({ ok: true });
  });

  it('ends the hand and pays the winner when the local player folds heads-up', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    const session = await gateway.connect(baseConfig({ botCount: 1, startingStack: 500 }));

    const events: ServerEvent[] = [];
    gateway.subscribe((event) => events.push(event));

    await gateway.send({ type: 'startHand' });
    const result = await gateway.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action: { kind: 'fold' },
    });

    expect(result).toEqual({ ok: true });
    const types = events.map((e) => e.type);
    expect(types).toContain('potAwarded');
    expect(types).toContain('handEnded');

    // Unequal SB/BB contributions (5 vs 10) make computeSidePots emit one
    // potAwarded per layer, even though both layers go to the same winner.
    const potAwardedEvents = events.filter(
      (e): e is Extract<ServerEvent, { type: 'potAwarded' }> => e.type === 'potAwarded',
    );
    expect(potAwardedEvents.every((e) => e.playerId !== session.localPlayerId)).toBe(true);
    const totalAwarded = potAwardedEvents.reduce((sum, e) => sum + e.amount, 0);
    expect(totalAwarded).toBe(15); // small blind + big blind, nobody else acted

    // The final pushed snapshot reflects the hand being over.
    const snapshots = events.filter(
      (e): e is Extract<ServerEvent, { type: 'stateChanged' }> => e.type === 'stateChanged',
    );
    const lastSnapshot = snapshots[snapshots.length - 1]?.snapshot;
    expect(lastSnapshot?.street).toBe('idle');
    expect(lastSnapshot?.pot).toBe(0);
  });

  it('rejects an illegal action and leaves the game state untouched', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    const session = await gateway.connect(baseConfig({ botCount: 1 }));
    await gateway.send({ type: 'startHand' });

    // It's the local player's turn facing the big blind — checking is illegal.
    const result = await gateway.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action: { kind: 'check' },
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.code).toBe('illegalAction');
    }
  });
});

describe('LocalGameGateway — disconnect', () => {
  it('stops delivering events to a subscriber after disconnect', async () => {
    const gateway = new LocalGameGateway({ rng: createMulberry32(42) });
    await gateway.connect(baseConfig({ botCount: 1 }));

    const events: ServerEvent[] = [];
    gateway.subscribe((event) => events.push(event));
    await gateway.disconnect();

    const result = await gateway.send({ type: 'startHand' });
    expect(result.ok).toBe(false);
    expect(events).toHaveLength(0);
  });
});

describe('LocalGameGateway — pacing', () => {
  it('with a step delay, shows intermediate streets and the showdown before the hand ends', async () => {
    vi.useFakeTimers();
    try {
      // Seed picked so the bot calls the all-in and the hand reaches showdown (a bot fold would skip it).
      const gateway = new LocalGameGateway({ rng: createMulberry32(3), stepDelayMs: 100 });
      const streets: string[] = [];
      gateway.subscribe((event) => {
        if (event.type === 'stateChanged') streets.push(event.snapshot.street);
      });
      const session = await gateway.connect({
        schemaVersion: 1,
        botCount: 1,
        startingStack: 1000,
        smallBlind: 5,
        bigBlind: 10,
        ante: 0,
        isTournament: false,
        botDifficulty: 'easy',
      });

      await gateway.send({ type: 'startHand' });
      await gateway.send({
        type: 'playerAction',
        playerId: session.localPlayerId,
        action: { kind: 'allIn' },
      });
      // Right after the human's move the hand is still going: nothing was fast-forwarded.
      expect(streets.at(-1)).not.toBe('idle');

      await vi.advanceTimersByTimeAsync(60_000);
      expect(streets).toContain('showdown');
      expect(streets.at(-1)).toBe('idle');
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('LocalGameGateway — bot raise wars', () => {
  it('lets a hand reach the flop when the human only ever calls', async () => {
    for (let seed = 1; seed <= 15; seed++) {
      const gateway = new LocalGameGateway({ rng: createMulberry32(seed) });
      let actions = 0;
      let reachedFlop = false;
      let acting: string | null = null;
      gateway.subscribe((event) => {
        if (event.type === 'actionTaken') actions++;
        if (event.type === 'streetAdvanced' && event.street === 'flop') reachedFlop = true;
        if (event.type === 'stateChanged') acting = event.snapshot.actingPlayerId;
      });
      const session = await gateway.connect(baseConfig({ botCount: 3, startingStack: 5000 }));
      await gateway.send({ type: 'startHand' });

      // Human calls until the flop appears (bounded so a regression fails instead of hanging).
      for (let i = 0; i < 12 && !reachedFlop && acting === session.localPlayerId; i++) {
        await gateway.send({
          type: 'playerAction',
          playerId: session.localPlayerId,
          action: { kind: 'call' },
        });
      }
      expect(
        reachedFlop,
        `seed ${String(seed)} stuck preflop after ${String(actions)} actions`,
      ).toBe(true);
    }
  });
});
