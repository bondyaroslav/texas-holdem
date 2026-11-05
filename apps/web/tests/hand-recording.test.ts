import { describe, expect, it } from 'vitest';
import {
  createInitialState,
  createMulberry32,
  reduce,
  toChips,
  toPlayerId,
  type EngineEvent,
} from '@poker/engine';
import {
  handRecordSchema,
  type GameSaveRepository,
  type HandRecord,
  type SavedGame,
  type TableConfig,
} from '@poker/protocol';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';

const config: TableConfig = {
  schemaVersion: 1,
  botCount: 1,
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  isTournament: false,
  botDifficulty: 'easy',
};

function recordingGateway(seed: number): { gateway: LocalGameGateway; records: HandRecord[] } {
  const records: HandRecord[] = [];
  let tick = 1_000;
  const gateway = new LocalGameGateway({
    rng: createMulberry32(seed),
    clock: () => (tick += 10),
    onHandRecorded: (record) => records.push(record),
  });
  return { gateway, records };
}

describe('LocalGameGateway — hand recording', () => {
  it('records a hand that ends in a fold, complete and schema-valid', async () => {
    const { gateway, records } = recordingGateway(1);
    const session = await gateway.connect(config);
    await gateway.send({ type: 'startHand' });
    // Heads-up the button (the human) acts first preflop.
    await gateway.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action: { kind: 'fold' },
    });

    expect(records).toHaveLength(1);
    const record = records[0];
    expect(handRecordSchema.safeParse(record).success).toBe(true);
    expect(record?.handNumber).toBe(1);
    expect(record?.heroId).toBe(session.localPlayerId);
    expect(record?.events[0]?.type).toBe('handStarted');
    expect(record?.events.at(-1)?.type).toBe('handEnded');
    expect(record?.board).toEqual([]);
    expect(record?.players.map((p) => p.holeCards.length)).toEqual([2, 2]);
    expect(record?.players.map((p) => p.botDifficulty)).toEqual([null, 'easy']);
    expect(record?.players.map((p) => p.startingStack)).toEqual([1000, 1000]);
    expect(record?.endedAt).toBeGreaterThan(record?.startedAt ?? Infinity);
    // 52 cards: 4 hole cards + the whole undealt deck.
    expect(4 + (record?.undealtCards.length ?? 0)).toBe(52);
  });

  it('records the full board and conserves chips when a hand goes to showdown', async () => {
    let showdown: HandRecord | undefined;
    for (let seed = 1; seed <= 30 && !showdown; seed++) {
      const { gateway, records } = recordingGateway(seed);
      const session = await gateway.connect(config);
      await gateway.send({ type: 'startHand' });
      await gateway.send({
        type: 'playerAction',
        playerId: session.localPlayerId,
        action: { kind: 'allIn' },
      });
      showdown = records.find((r) => r.board.length === 5);
    }

    expect(showdown).toBeDefined();
    const start = showdown?.players.reduce((sum, p) => sum + p.startingStack, 0);
    const end = showdown?.players.reduce((sum, p) => sum + p.endingStack, 0);
    expect(end).toBe(start);
    expect(showdown?.undealtCards).toHaveLength(52 - 4 - 5);
    const dealtBoard = showdown?.events
      .filter(
        (e): e is Extract<EngineEvent, { type: 'streetAdvanced' }> => e.type === 'streetAdvanced',
      )
      .flatMap((e) => e.communityCards);
    expect(dealtBoard).toEqual(showdown?.board);
  });

  it('stores a seed that reproduces the deal', async () => {
    const { gateway, records } = recordingGateway(5);
    const session = await gateway.connect(config);
    await gateway.send({ type: 'startHand' });
    await gateway.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action: { kind: 'fold' },
    });

    const record = records[0];
    const replay = reduce(
      createInitialState({
        playerIds: [toPlayerId('local-player'), toPlayerId('bot-1')],
        startingStack: toChips(1000),
        blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
      }),
      { type: 'startHand' },
      { rng: createMulberry32(record?.seed ?? -1) },
    );

    expect(replay.ok).toBe(true);
    const dealt = (events: readonly EngineEvent[] | undefined): EngineEvent[] =>
      (events ?? []).filter((e) => e.type === 'cardsDealt');
    expect(dealt(replay.ok ? replay.value.events : undefined)).toEqual(dealt(record?.events));
  });

  it('gives consecutive hands distinct ids, numbers and seeds', async () => {
    const { gateway, records } = recordingGateway(2);
    const session = await gateway.connect(config);
    for (let i = 0; i < 2; i++) {
      await gateway.send({ type: 'startHand' });
      // After the dealer button moves the bot may be first to act; the gateway then plays it.
      await gateway.send({
        type: 'playerAction',
        playerId: session.localPlayerId,
        action: { kind: 'fold' },
      });
    }

    expect(records.map((r) => r.handNumber)).toEqual([1, 2]);
    expect(new Set(records.map((r) => r.id)).size).toBe(2);
    expect(records[0]?.seed).not.toBe(records[1]?.seed);
  });

  it('does not record a hand abandoned by disconnect', async () => {
    const { gateway, records } = recordingGateway(3);
    await gateway.connect(config);
    await gateway.send({ type: 'startHand' });
    await gateway.disconnect();

    expect(records).toHaveLength(0);
  });

  it('does not record a hand resumed from a save mid-way', async () => {
    let saved: SavedGame | null = null;
    const saveRepository: GameSaveRepository = {
      load: () => saved,
      save: (game) => {
        saved = game;
      },
      clear: () => {
        saved = null;
      },
    };
    const records: HandRecord[] = [];

    const first = new LocalGameGateway({ rng: createMulberry32(4), saveRepository });
    await first.connect(config);
    await first.send({ type: 'startHand' });
    await first.disconnect();

    const resumed = new LocalGameGateway({
      rng: createMulberry32(9),
      saveRepository,
      onHandRecorded: (r) => records.push(r),
    });
    const session = await resumed.connect(config);
    await resumed.send({
      type: 'playerAction',
      playerId: session.localPlayerId,
      action: { kind: 'fold' },
    });

    // The save was taken mid-hand: the hand finished, but its first half was never recorded.
    expect(records).toHaveLength(0);
  });
});
