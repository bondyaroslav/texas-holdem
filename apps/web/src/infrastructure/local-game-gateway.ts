import {
  botDifficultyForSeat,
  isSameTableConfig,
  type BotDifficulty,
  type ClientCommand,
  type GameGateway,
  type GameSaveRepository,
  type GatewayError,
  type HandRecord,
  type ServerEvent,
  type TableConfig,
  type TableSession,
  type Unsubscribe,
} from '@poker/protocol';
import {
  assertNever,
  createInitialState,
  createMulberry32,
  ok,
  projectStateFor,
  rankPlayersForShowdown,
  reduce,
  toChips,
  toPlayerId,
  type ActionInput,
  type EngineCommand,
  type EngineError,
  type EngineEvent,
  type GameState,
  type PlayerId,
  type Result,
  type Rng,
} from '@poker/engine';
import { HandRecorder } from './hand-recorder.js';
import {
  decideBotAction,
  OpponentModel,
  rangeStepFor,
  toPlayerView,
  type BotDecisionRequest,
  type RangeStep,
} from '@poker/ai';

/** Decides a bot's action somewhere else (a Web Worker) — same input, same answer as in-process. */
export type BotDecider = (request: BotDecisionRequest) => Promise<ActionInput>;

function createDefaultRng(): Rng {
  const seed = new Uint32Array(1);
  if (typeof crypto !== 'undefined') {
    crypto.getRandomValues(seed);
  } else {
    seed[0] = Date.now() >>> 0;
  }
  return createMulberry32(seed[0] ?? 0);
}

function createDefaultId(startedAt: number, seed: number): string {
  // The seed is random per hand, so this stays unique where randomUUID is unavailable.
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${String(startedAt)}-${String(seed)}`;
}

function toEngineCommand(command: ClientCommand): EngineCommand {
  switch (command.type) {
    case 'startHand':
      return { type: 'startHand' };
    case 'playerAction':
      return { type: 'playerAction', playerId: command.playerId, action: command.action };
    case 'advanceStreet':
      return { type: 'advanceStreet' };
    default:
      return assertNever(command);
  }
}

function toServerEvent(event: EngineEvent): ServerEvent {
  switch (event.type) {
    case 'handStarted':
      return { type: 'handStarted', handNumber: event.handNumber };
    case 'blindsPosted':
      return {
        type: 'blindsPosted',
        playerId: event.playerId,
        amount: event.amount,
        kind: event.kind,
      };
    case 'cardsDealt':
      return { type: 'cardsDealt', playerId: event.playerId, cards: event.cards };
    case 'actionTaken':
      return { type: 'actionTaken', playerId: event.playerId, action: event.action };
    case 'streetAdvanced':
      return { type: 'streetAdvanced', street: event.street, communityCards: event.communityCards };
    case 'potAwarded':
      return { type: 'potAwarded', playerId: event.playerId, amount: event.amount };
    case 'handEnded':
      return { type: 'handEnded' };
    default:
      return assertNever(event);
  }
}

function describeEngineError(error: EngineError): string {
  switch (error.code) {
    case 'handAlreadyInProgress':
      return 'A hand is already in progress.';
    case 'noHandInProgress':
      return 'No hand is in progress.';
    case 'notEnoughPlayers':
      return 'Not enough players with chips to start a hand.';
    case 'unknownPlayer':
      return `Unknown player "${error.playerId}".`;
    case 'notPlayersTurn':
      return "It is not this player's turn.";
    case 'illegalAction':
      return error.reason;
    case 'bettingRoundNotComplete':
      return 'The betting round is not finished yet.';
    case 'notAtShowdown':
      return 'The hand has not reached showdown yet.';
    case 'noRankingForEligiblePlayers':
      return 'No hand ranking covers one of the players eligible for this pot.';
    default:
      return assertNever(error);
  }
}

function toGatewayError(error: EngineError): GatewayError {
  return { code: error.code, message: describeEngineError(error) };
}

/**
 * In-memory implementation of {@link GameGateway}: engine + AI run on the
 * client, no network involved. UI code only ever talks to the `GameGateway`
 * interface, so this can be swapped for a `RemoteGameGateway` later without
 * touching pages/features/entities.
 *
 * Drives the hand forward on its own between human decisions: closes betting
 * rounds, deals the next street, resolves showdowns and plays every bot's
 * turn, pausing only when it's the local player's turn or the hand is over.
 *
 * With a `botDecider` bots think off the main thread (a Web Worker in the
 * app), so Monte Carlo for Hard/Expert never blocks the UI (CLAUDE.md §3.3).
 * Without one they decide in-process and synchronously, which tests rely on.
 */
export class LocalGameGateway implements GameGateway {
  private readonly listeners = new Set<(event: ServerEvent) => void>();
  private readonly rng: Rng;
  private readonly bots = new Map<PlayerId, BotDifficulty>();
  private readonly botDecider: BotDecider | undefined;
  /** Public actions of the hand in progress — what every bot may know about it. */
  private handSteps: RangeStep[] = [];
  /** Tendencies seen across hands at this table, for Expert bots. */
  private readonly opponents = new OpponentModel();
  private readonly stepDelayMs: number;
  private readonly saveRepository: GameSaveRepository | undefined;
  private readonly clock: () => number;
  private readonly onHandRecorded: ((record: HandRecord) => void) | undefined;
  private readonly recorder: HandRecorder;
  private config: TableConfig | null = null;
  private state: GameState | null = null;
  private localPlayerId: PlayerId | null = null;
  /** Bumped on connect/disconnect so a paced run left over from an old session stops itself. */
  private session = 0;
  /** Seed of the hand being recorded, used to keep generated ids unique. */
  private lastHandSeed = 0;
  private running = false;

  /**
   * `stepDelayMs` paces bot actions, street reveals and the showdown so the
   * player can follow the hand. 0 (default) keeps everything synchronous,
   * which is what the tests rely on.
   *
   * With a `saveRepository` the game is saved after every change and
   * `connect()` resumes a saved game made with the same config.
   *
   * Every hand played from its first card is handed to `onHandRecorded` once
   * it ends. A hand resumed from a save has no event log, so it is not recorded.
   */
  constructor(
    deps: {
      readonly rng?: Rng;
      readonly stepDelayMs?: number;
      readonly saveRepository?: GameSaveRepository;
      readonly clock?: () => number;
      readonly onHandRecorded?: (record: HandRecord) => void;
      readonly botDecider?: BotDecider;
    } = {},
  ) {
    this.rng = deps.rng ?? createDefaultRng();
    this.saveRepository = deps.saveRepository;
    this.stepDelayMs = Math.max(0, deps.stepDelayMs ?? 0);
    this.clock = deps.clock ?? Date.now;
    this.onHandRecorded = deps.onHandRecorded;
    this.botDecider = deps.botDecider;
    this.recorder = new HandRecorder(() => createDefaultId(this.clock(), this.lastHandSeed));
  }

  connect(tableConfig: TableConfig): Promise<TableSession> {
    const localPlayerId = toPlayerId('local-player');
    const botIds = Array.from({ length: tableConfig.botCount }, (_, i) =>
      toPlayerId(`bot-${String(i + 1)}`),
    );

    this.session++;
    this.recorder.discard();
    this.bots.clear();
    this.handSteps = [];
    this.opponents.clear();
    botIds.forEach((id, index) => {
      this.bots.set(id, botDifficultyForSeat(tableConfig, index));
    });

    // A save made under different settings belongs to a different table — start fresh.
    const saved = this.saveRepository?.load();
    const resumed = saved && isSameTableConfig(saved.config, tableConfig) ? saved.state : null;

    this.config = tableConfig;
    this.state =
      resumed ??
      createInitialState({
        playerIds: [localPlayerId, ...botIds],
        startingStack: toChips(tableConfig.startingStack),
        blinds: {
          smallBlind: toChips(tableConfig.smallBlind),
          bigBlind: toChips(tableConfig.bigBlind),
          ante: toChips(tableConfig.ante),
        },
      });
    this.localPlayerId = localPlayerId;
    this.persist();
    this.publishSnapshot();
    if (resumed) {
      // The save may have been taken mid-hand with a bot on the clock.
      void this.runUntilHumanTurnOrHandOver();
    }

    return Promise.resolve({ tableId: 'local-table', localPlayerId });
  }

  send(
    command: ClientCommand,
  ): Promise<{ readonly ok: true } | { readonly ok: false; readonly error: GatewayError }> {
    if (!this.state) {
      return Promise.resolve({
        ok: false,
        error: { code: 'notConnected', message: 'Call connect() before sending commands.' },
      });
    }

    if (command.type === 'startHand' && this.state.handNumber > 0) {
      this.rotateDealerButton();
    }

    // Each hand shuffles from its own seed (drawn from the table RNG), so a recorded hand can be reproduced.
    const hand = command.type === 'startHand' ? this.createHandRng() : undefined;
    const result = this.applyCommand(toEngineCommand(command), hand);
    if (!result.ok) {
      return Promise.resolve({ ok: false, error: toGatewayError(result.error) });
    }

    void this.runUntilHumanTurnOrHandOver();
    return Promise.resolve({ ok: true });
  }

  subscribe(listener: (event: ServerEvent) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  disconnect(): Promise<void> {
    this.session++;
    this.recorder.discard();
    this.listeners.clear();
    this.bots.clear();
    this.state = null;
    this.config = null;
    this.localPlayerId = null;
    return Promise.resolve();
  }

  private requireState(): GameState {
    if (!this.state) {
      throw new Error('LocalGameGateway: no active game — call connect() first.');
    }
    return this.state;
  }

  private createHandRng(): { readonly rng: Rng; readonly seed: number } {
    const seed = Math.floor(this.rng.next() * 2 ** 32) >>> 0;
    return { rng: createMulberry32(seed), seed };
  }

  private applyCommand(
    command: EngineCommand,
    hand?: { readonly rng: Rng; readonly seed: number },
  ): Result<void, EngineError> {
    const state = this.requireState();
    const result = reduce(state, command, { rng: hand?.rng ?? this.rng });
    if (!result.ok) {
      return result;
    }
    this.state = result.value.state;
    this.trackPublicHistory(command, state, result.value.events);
    this.record(command, state, result.value.events, hand?.seed);
    this.persist();
    for (const event of result.value.events) {
      this.publish(toServerEvent(event));
    }
    this.publishSnapshot();
    return ok(undefined);
  }

  private record(
    command: EngineCommand,
    stateBefore: GameState,
    events: readonly EngineEvent[],
    seed: number | undefined,
  ): void {
    if (command.type === 'startHand' && seed !== undefined) {
      this.lastHandSeed = seed;
      this.recorder.begin({ stateBefore, seed, startedAt: this.clock() });
    }
    this.recorder.append(events);

    if (!events.some((event) => event.type === 'handEnded') || !this.state) {
      return;
    }
    if (!this.config || !this.localPlayerId) {
      return;
    }
    const record = this.recorder.finish({
      stateAfter: this.state,
      endedAt: this.clock(),
      context: {
        tableId: 'local-table',
        heroId: this.localPlayerId,
        config: this.config,
        botDifficulties: this.bots,
      },
    });
    if (record) {
      this.onHandRecorded?.(record);
    }
  }

  /** Keeps this hand's public actions for the bots, and feeds finished hands to the opponent model. */
  private trackPublicHistory(
    command: EngineCommand,
    stateBefore: GameState,
    events: readonly EngineEvent[],
  ): void {
    if (command.type === 'startHand') this.handSteps = [];
    for (const event of events) {
      if (event.type === 'actionTaken' && command.type === 'playerAction') {
        const step = rangeStepFor(stateBefore, command.playerId, event.action, this.handSteps);
        if (step) this.handSteps.push(step);
      } else if (event.type === 'handEnded' && this.state) {
        const dealtIn = this.state.players.filter((p) => p.holeCards.length === 2).map((p) => p.id);
        this.opponents.recordHand(this.handSteps, dealtIn);
      }
    }
  }

  /**
   * Saves the table; a finished game is cleared so "new game" starts fresh.
   * Finished means over for the human: they busted, or they are the last one
   * with chips. Bots may still have chips between them after the human busts —
   * keeping that save would resume the busted table forever.
   */
  private persist(): void {
    if (!this.saveRepository || !this.state || !this.config) {
      return;
    }
    const between = this.state.street === 'idle' && this.state.handNumber > 0;
    const humanBusted = this.state.players.find((p) => p.id === this.localPlayerId)?.stack === 0;
    const isOver =
      between && (humanBusted || this.state.players.filter((p) => p.stack > 0).length < 2);
    if (isOver) {
      this.saveRepository.clear();
      return;
    }
    this.saveRepository.save({ schemaVersion: 1, config: this.config, state: this.state });
  }

  private publish(event: ServerEvent): void {
    for (const listener of this.listeners) {
      listener(event);
    }
  }

  /** Pushes a full client-safe snapshot — the UI renders from this, the granular events above are for logs/animation. */
  private publishSnapshot(): void {
    if (!this.state || !this.localPlayerId) {
      return;
    }
    this.publish({
      type: 'stateChanged',
      snapshot: projectStateFor(this.state, this.localPlayerId),
    });
  }

  /** Moves the button to the next seat with chips — the engine itself never rotates it. */
  private rotateDealerButton(): void {
    const state = this.requireState();
    const seatCount = state.players.length;
    for (let offset = 1; offset <= seatCount; offset++) {
      const index = (state.dealerIndex + offset) % seatCount;
      if ((state.players[index]?.stack ?? 0) > 0) {
        this.state = { ...state, dealerIndex: index };
        return;
      }
    }
  }

  private resolveShowdown(): Result<void, EngineError> {
    const state = this.requireState();
    const hands = new Map(
      state.players.filter((p) => p.status !== 'folded').map((p) => [p.id, p.holeCards] as const),
    );
    const rankedGroups = rankPlayersForShowdown(hands, state.communityCards);
    return this.applyCommand({ type: 'resolveShowdown', rankedGroups });
  }

  private pause(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Advances streets, resolves showdowns and plays bot turns until a human
   * decision is needed. With a step delay each step is awaited, so the UI
   * sees every intermediate snapshot instead of only the final one; with no
   * delay it never awaits and therefore completes before `send` returns.
   */
  private async runUntilHumanTurnOrHandOver(): Promise<void> {
    if (this.running) {
      return;
    }
    this.running = true;
    const session = this.session;
    try {
      // Bounded so a reducer bug can't hang the tab instead of surfacing as a stuck state.
      const maxSteps = 500;
      for (let step = 0; step < maxSteps; step++) {
        const state = this.state;
        if (!state || session !== this.session) {
          return;
        }

        if (state.street === 'showdown') {
          // Hold the revealed hands on screen before the pot is paid out.
          if (this.stepDelayMs > 0) await this.pause(this.stepDelayMs * 2.5);
          if (session !== this.session || !this.resolveShowdown().ok) {
            return;
          }
          continue;
        }

        if (state.toAct.length === 0) {
          if (state.street === 'idle') {
            return; // hand is over; waiting for the next startHand command
          }
          if (this.stepDelayMs > 0) await this.pause(this.stepDelayMs * 1.2);
          if (session !== this.session || !this.applyCommand({ type: 'advanceStreet' }).ok) {
            return;
          }
          continue;
        }

        const actingId = state.actingPlayerId;
        if (!actingId || actingId === this.localPlayerId) {
          return; // the human is on the clock
        }

        const difficulty = this.bots.get(actingId);
        if (!difficulty) {
          return; // not a seat we control — don't guess on someone else's behalf
        }

        if (this.stepDelayMs > 0) await this.pause(this.stepDelayMs * 1);
        if (session !== this.session) {
          return;
        }
        const request: BotDecisionRequest = {
          view: toPlayerView(state, actingId, this.handSteps),
          difficulty,
          seed: Math.floor(this.rng.next() * 2 ** 32) >>> 0,
          opponentStats: this.opponents.snapshot(),
          isTournament: this.config?.isTournament ?? false,
        };
        const action = this.botDecider ? await this.botDecider(request) : decideBotAction(request);
        // The table may have moved on while a worker was thinking (disconnect, new game).
        if (session !== this.session || this.state !== state) {
          return;
        }
        if (!this.applyCommand({ type: 'playerAction', playerId: actingId, action }).ok) {
          return;
        }
      }
    } finally {
      this.running = false;
    }
  }
}
