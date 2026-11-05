import type { Card, EngineEvent, GameState, PlayerId } from '@poker/engine';
import type { BotDifficulty, HandRecord, TableConfig } from '@poker/protocol';

interface ActiveHand {
  readonly stateBefore: GameState;
  readonly seed: number;
  readonly startedAt: number;
  readonly events: EngineEvent[];
}

export interface HandRecorderContext {
  readonly tableId: string;
  readonly heroId: PlayerId;
  readonly config: TableConfig;
  /** Each bot's level; seats missing here are recorded as the human. */
  readonly botDifficulties: ReadonlyMap<PlayerId, BotDifficulty>;
}

/**
 * Collects the engine events of the hand in progress and, once it ends,
 * turns them into a self-contained {@link HandRecord}.
 *
 * It only records hands it saw from the first card: a table resumed mid-hand
 * has no event log for the part already played, so that hand is skipped
 * rather than saved half-complete.
 */
export class HandRecorder {
  private active: ActiveHand | null = null;

  constructor(private readonly generateId: () => string) {}

  /** `stateBefore` is the state the `startHand` command was applied to (stacks before any blind). */
  begin(input: {
    readonly stateBefore: GameState;
    readonly seed: number;
    readonly startedAt: number;
  }): void {
    this.active = { ...input, events: [] };
  }

  append(events: readonly EngineEvent[]): void {
    this.active?.events.push(...events);
  }

  /** Builds the record for the hand that just ended; `null` when no hand was being recorded. */
  finish(input: {
    readonly stateAfter: GameState;
    readonly endedAt: number;
    readonly context: HandRecorderContext;
  }): HandRecord | null {
    const hand = this.active;
    this.active = null;
    if (!hand) {
      return null;
    }

    const holeCards = new Map<PlayerId, readonly Card[]>();
    const board: Card[] = [];
    for (const event of hand.events) {
      if (event.type === 'cardsDealt') {
        holeCards.set(event.playerId, event.cards);
      } else if (event.type === 'streetAdvanced') {
        // The engine clears `communityCards` when the hand ends, so the board
        // is rebuilt from the cards each street dealt.
        board.push(...event.communityCards);
      }
    }

    const { stateAfter, endedAt, context } = input;
    const players = hand.stateBefore.players.flatMap((player, seat) => {
      const cards = holeCards.get(player.id);
      if (!cards) {
        return []; // sat out this hand: never dealt in
      }
      const after = stateAfter.players.find((p) => p.id === player.id);
      return [
        {
          id: player.id,
          seat,
          botDifficulty: context.botDifficulties.get(player.id) ?? null,
          startingStack: player.stack,
          endingStack: after?.stack ?? player.stack,
          holeCards: cards,
        },
      ];
    });

    return {
      schemaVersion: 1,
      id: this.generateId(),
      tableId: context.tableId,
      handNumber: stateAfter.handNumber,
      seed: hand.seed,
      startedAt: hand.startedAt,
      endedAt,
      config: context.config,
      blinds: hand.stateBefore.blinds,
      dealerIndex: hand.stateBefore.dealerIndex,
      heroId: context.heroId,
      players,
      board,
      undealtCards: stateAfter.deck,
      events: hand.events,
    };
  }

  /** Drops the hand in progress (e.g. on disconnect). */
  discard(): void {
    this.active = null;
  }
}
