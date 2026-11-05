import { describe, expect, it, vi } from 'vitest';
import { createInitialState, createMulberry32, reduce, toChips, toPlayerId } from '@poker/engine';
import { decideBotAction, toPlayerView, type BotDecisionRequest } from '@poker/ai';
import type { HandRecord, ProjectedState, ServerEvent, TableConfig } from '@poker/protocol';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';
import { WorkerBotDecider, type BotWorkerLike } from '@/infrastructure/bots';
import type { BotWorkerRequest, BotWorkerResponse } from '@/infrastructure/bots/bot-messages';

const config: TableConfig = {
  schemaVersion: 1,
  botCount: 4,
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  isTournament: false,
  botDifficulty: 'mixed',
};

/** Plays `count` hands, folding whenever it is the human's turn. */
async function playHands(gateway: LocalGameGateway, count: number): Promise<void> {
  let snapshot: ProjectedState | null = null;
  gateway.subscribe((event: ServerEvent) => {
    if (event.type === 'stateChanged') snapshot = event.snapshot;
  });
  const session = await gateway.connect(config);
  for (let i = 0; i < count; i++) {
    await gateway.send({ type: 'startHand' });
    await vi.waitFor(
      async () => {
        const s = snapshot as ProjectedState | null;
        if (s?.actingPlayerId === session.localPlayerId) {
          await gateway.send({
            type: 'playerAction',
            playerId: session.localPlayerId,
            action: { kind: 'fold' },
          });
        }
        expect((snapshot as ProjectedState | null)?.street).toBe('idle');
      },
      { timeout: 5000, interval: 5 },
    );
  }
}

describe('bot levels at the table', () => {
  it('a mixed table seats different levels and records each one', async () => {
    const records: HandRecord[] = [];
    const gateway = new LocalGameGateway({
      rng: createMulberry32(3),
      onHandRecorded: (record) => records.push(record),
    });
    await playHands(gateway, 2);

    const levels = records[0]?.players.map((p) => p.botDifficulty);
    expect(levels).toEqual([null, 'easy', 'medium', 'hard', 'expert']);
  });

  it('plays whole hands with decisions coming from an asynchronous decider', async () => {
    const records: HandRecord[] = [];
    const decide = vi.fn((request: BotDecisionRequest) =>
      Promise.resolve(decideBotAction(request)),
    );
    const gateway = new LocalGameGateway({
      rng: createMulberry32(8),
      botDecider: decide,
      onHandRecorded: (record) => records.push(record),
    });
    await playHands(gateway, 3);

    expect(records).toHaveLength(3);
    expect(decide).toHaveBeenCalled();
    // Bots see the public history of the hand, never another player's cards.
    const request = decide.mock.calls.at(-1)?.[0];
    expect(request?.view.opponents.every((o) => !('holeCards' in o))).toBe(true);
  });
});

class FakeWorker implements BotWorkerLike {
  onmessage: ((event: MessageEvent<BotWorkerResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  readonly sent: BotWorkerRequest[] = [];
  terminated = false;

  constructor(private readonly behaviour: 'answer' | 'fail' | 'silent') {}

  postMessage(message: BotWorkerRequest): void {
    this.sent.push(message);
    if (this.behaviour === 'silent') return;
    const response: BotWorkerResponse =
      this.behaviour === 'answer'
        ? { id: message.id, ok: true, action: { kind: 'check' } }
        : { id: message.id, ok: false, message: 'boom' };
    queueMicrotask(() => this.onmessage?.({ data: response } as MessageEvent<BotWorkerResponse>));
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('WorkerBotDecider', () => {
  /** A real decision request: a Hard bot first to act in a fresh hand. */
  const request: BotDecisionRequest = (() => {
    const started = reduce(
      createInitialState({
        playerIds: [toPlayerId('a'), toPlayerId('b'), toPlayerId('c')],
        startingStack: toChips(1000),
        blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
      }),
      { type: 'startHand' },
      { rng: createMulberry32(1) },
    );
    if (!started.ok) throw new Error('could not start a hand');
    const state = started.value.state;
    const actor = state.actingPlayerId;
    if (!actor) throw new Error('nobody to act');
    return { view: toPlayerView(state, actor), difficulty: 'hard', seed: 7 };
  })();

  it('returns the worker’s answer', async () => {
    const worker = new FakeWorker('answer');
    const decider = new WorkerBotDecider(() => worker);
    await expect(decider.decide(request)).resolves.toEqual({ kind: 'check' });
    expect(worker.sent).toHaveLength(1);
  });

  it('decides on the main thread when the worker fails or crashes', async () => {
    const expected = decideBotAction(request);

    const failing = new WorkerBotDecider(() => new FakeWorker('fail'));
    await expect(failing.decide(request)).resolves.toEqual(expected);

    const silent = new FakeWorker('silent');
    const crashing = new WorkerBotDecider(() => silent);
    const pending = crashing.decide(request);
    silent.onerror?.({ message: 'dead' } as ErrorEvent);
    await expect(pending).resolves.toEqual(expected);
    expect(silent.terminated).toBe(true);
  });
});
