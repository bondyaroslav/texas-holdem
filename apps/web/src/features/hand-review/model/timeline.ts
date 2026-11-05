import type { HandRecord } from '@poker/protocol';
import type { ActionKind, Card, Message, PlayerId } from './types.js';

export type ReplayStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';

export interface ReplayPlayer {
  readonly id: PlayerId;
  readonly seat: number;
  readonly holeCards: readonly Card[];
  readonly stack: number;
  /** Chips in front of the player on the current street. */
  readonly streetBet: number;
  readonly folded: boolean;
  readonly allIn: boolean;
  /** This street's last action; cleared when a new street is dealt. */
  readonly lastAction: ActionKind | null;
  /** Chips collected when the hand was settled (result frame only). */
  readonly won: number;
}

/** The table after one step of the hand — everything the replayer draws. */
export interface ReplayFrame {
  /** Index into `record.events` of the event that produced this frame. */
  readonly eventIndex: number;
  readonly street: ReplayStreet;
  readonly board: readonly Card[];
  readonly pot: number;
  readonly players: readonly ReplayPlayer[];
  readonly actorId: PlayerId | null;
  /** What happened, as an i18n message (`replay.*`). */
  readonly message: Message;
}

type MutablePlayer = { -readonly [K in keyof ReplayPlayer]: ReplayPlayer[K] };

/**
 * Turns a hand record into the frames a replayer steps through: the deal,
 * every action, every new street, the showdown and the settlement. Purely
 * presentational bookkeeping of what is visible on the table; every number
 * comes from the record's own events.
 */
export function buildTimeline(record: HandRecord): readonly ReplayFrame[] {
  const players: MutablePlayer[] = record.players.map((p) => ({
    id: p.id,
    seat: p.seat,
    holeCards: p.holeCards,
    stack: p.startingStack,
    streetBet: 0,
    folded: false,
    allIn: false,
    lastAction: null,
    won: 0,
  }));
  const byId = new Map(players.map((p) => [p.id, p]));
  const board: Card[] = [];
  let street: ReplayStreet = 'preflop';
  let pot = 0;
  let currentBet = 0;
  let dealt = false;
  const frames: ReplayFrame[] = [];

  const snapshot = (eventIndex: number, actorId: PlayerId | null, message: Message): void => {
    frames.push({
      eventIndex,
      street,
      board: [...board],
      pot,
      players: players.map((p) => ({ ...p })),
      actorId,
      message,
    });
  };
  const pay = (player: MutablePlayer, chips: number, countsForStreet: boolean): void => {
    player.stack -= chips;
    if (countsForStreet) player.streetBet += chips;
    pot += chips;
    if (player.stack <= 0) player.allIn = true;
  };

  for (const [index, event] of record.events.entries()) {
    const isSetup =
      event.type === 'handStarted' || event.type === 'blindsPosted' || event.type === 'cardsDealt';
    if (!isSetup && !dealt) {
      dealt = true;
      snapshot(index - 1, null, { key: 'replay.deal', params: { players: players.length } });
    }

    switch (event.type) {
      case 'blindsPosted': {
        const player = byId.get(event.playerId);
        if (player) pay(player, event.amount, event.kind !== 'ante');
        if (event.kind !== 'ante') currentBet = Math.max(currentBet, record.blinds.bigBlind);
        break;
      }
      case 'actionTaken': {
        const player = byId.get(event.playerId);
        if (!player) break;
        const action = event.action;
        let amount = 0;
        if (action.kind === 'fold') {
          player.folded = true;
        } else if (action.kind === 'call') {
          amount = Math.min(currentBet - player.streetBet, player.stack);
          pay(player, amount, true);
        } else if (action.kind === 'bet' || action.kind === 'raise') {
          amount = action.amount;
          pay(player, action.amount - player.streetBet, true);
          currentBet = action.amount;
        }
        player.lastAction = action.kind;
        snapshot(index, player.id, {
          key: `replay.action.${action.kind}`,
          params: { player: player.id, amount },
        });
        break;
      }
      case 'streetAdvanced':
        if (event.street === 'showdown') {
          street = 'showdown';
          snapshot(index, null, { key: 'replay.showdown', params: {} });
        } else if (event.street !== 'idle' && event.street !== 'preflop') {
          street = event.street;
          board.push(...event.communityCards);
          currentBet = 0;
          for (const p of players) {
            p.streetBet = 0;
            p.lastAction = null;
          }
          snapshot(index, null, { key: `replay.street.${event.street}`, params: {} });
        }
        break;
      case 'potAwarded': {
        const player = byId.get(event.playerId);
        if (player) player.won += event.amount;
        break;
      }
      case 'handEnded': {
        for (const p of players) p.stack += p.won;
        const winners = players.filter((p) => p.won > 0);
        snapshot(index, null, {
          key: 'replay.result',
          params: {
            winners: winners.map((p) => p.id).join(','),
            amount: winners.reduce((sum, p) => sum + p.won, 0),
          },
        });
        break;
      }
      default:
        break;
    }
  }

  if (!dealt) {
    snapshot(record.events.length - 1, null, {
      key: 'replay.deal',
      params: { players: players.length },
    });
  }
  return frames;
}

/** Index of the frame showing the table just before the action at `eventIndex` — the decision point. */
export function frameBeforeEvent(frames: readonly ReplayFrame[], eventIndex: number): number {
  const at = frames.findIndex((f) => f.eventIndex === eventIndex);
  return at <= 0 ? 0 : at - 1;
}
