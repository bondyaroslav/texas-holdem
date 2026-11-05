import type { ActionInput, Card, PlayerId } from '@poker/engine';
import { positionOf, type Position } from '@poker/ai';
import type { HandRecord } from '@poker/protocol';

export type BettingStreet = 'preflop' | 'flop' | 'turn' | 'river';

/** The table as it stood immediately before one player's action. */
export interface ActionStep {
  /** Index into `record.events`. */
  readonly eventIndex: number;
  readonly playerId: PlayerId;
  /** As recorded: `bet`/`raise` amounts are the total committed this street. */
  readonly action: ActionInput;
  readonly street: BettingStreet;
  readonly board: readonly Card[];
  readonly potBefore: number;
  /** Chips needed to call, capped at the actor's stack. */
  readonly toCall: number;
  readonly stackBefore: number;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly committedThisStreetBefore: number;
  /** Everyone's total contribution to the hand so far. */
  readonly committed: ReadonlyMap<PlayerId, number>;
  readonly stacks: ReadonlyMap<PlayerId, number>;
  readonly folded: ReadonlySet<PlayerId>;
  readonly allIn: ReadonlySet<PlayerId>;
  /** Bets/raises already made this street (preflop: raises over the big blind). */
  readonly raisesBefore: number;
}

/**
 * Walks the record's events, tracking chips the way the engine does, and
 * returns the state before every voluntary action. Reading the events
 * (rather than re-running the engine) keeps analysis independent of engine
 * internals — the record is all it needs.
 */
export function replayActions(record: HandRecord): readonly ActionStep[] {
  return replayHand(record).steps;
}

/** Chips and cards once every event has been applied, before pots are paid out. */
export interface FinalTable {
  readonly committed: ReadonlyMap<PlayerId, number>;
  readonly folded: ReadonlySet<PlayerId>;
  readonly board: readonly Card[];
  /** The engine moved the hand to showdown (as opposed to everyone else folding). */
  readonly reachedShowdown: boolean;
}

export function replayHand(record: HandRecord): {
  readonly steps: readonly ActionStep[];
  readonly final: FinalTable;
} {
  const bigBlind = record.blinds.bigBlind;
  const stacks = new Map<PlayerId, number>(record.players.map((p) => [p.id, p.startingStack]));
  const committed = new Map<PlayerId, number>(record.players.map((p) => [p.id, 0]));
  const thisStreet = new Map<PlayerId, number>(record.players.map((p) => [p.id, 0]));
  const folded = new Set<PlayerId>();
  const allIn = new Set<PlayerId>();
  const board: Card[] = [];
  let street: BettingStreet = 'preflop';
  let currentBet: number = bigBlind;
  let minRaise: number = bigBlind;
  let raises = 0;
  let reachedShowdown = false;

  const pay = (id: PlayerId, chips: number, countsForStreet: boolean): void => {
    const stack = (stacks.get(id) ?? 0) - chips;
    stacks.set(id, stack);
    committed.set(id, (committed.get(id) ?? 0) + chips);
    if (countsForStreet) {
      thisStreet.set(id, (thisStreet.get(id) ?? 0) + chips);
    }
    if (stack <= 0) {
      allIn.add(id);
    }
  };
  const pot = (): number => [...committed.values()].reduce((sum, v) => sum + v, 0);

  const steps: ActionStep[] = [];
  record.events.forEach((event, eventIndex) => {
    switch (event.type) {
      case 'blindsPosted':
        pay(event.playerId, event.amount, event.kind !== 'ante');
        break;
      case 'streetAdvanced':
        // The step into 'showdown' deals nothing and opens no betting.
        if (event.street === 'showdown') reachedShowdown = true;
        if (event.street === 'flop' || event.street === 'turn' || event.street === 'river') {
          street = event.street;
          board.push(...event.communityCards);
          for (const id of thisStreet.keys()) thisStreet.set(id, 0);
          currentBet = 0;
          minRaise = bigBlind;
          raises = 0;
        }
        break;
      case 'actionTaken': {
        const id = event.playerId;
        const stack = stacks.get(id) ?? 0;
        const already = thisStreet.get(id) ?? 0;
        const toCallFull = Math.max(0, currentBet - already);
        steps.push({
          eventIndex,
          playerId: id,
          action: event.action,
          street,
          board: [...board],
          potBefore: pot(),
          toCall: Math.min(toCallFull, stack),
          stackBefore: stack,
          currentBet,
          minRaise,
          committedThisStreetBefore: already,
          committed: new Map(committed),
          stacks: new Map(stacks),
          folded: new Set(folded),
          allIn: new Set(allIn),
          raisesBefore: raises,
        });
        const action = event.action;
        if (action.kind === 'fold') {
          folded.add(id);
        } else if (action.kind === 'call') {
          pay(id, Math.min(toCallFull, stack), true);
        } else if (action.kind === 'bet' || action.kind === 'raise') {
          pay(id, action.amount - already, true);
          const increase = action.amount - currentBet;
          if (increase >= minRaise) minRaise = increase;
          currentBet = action.amount;
          raises++;
        }
        // 'check' and 'allIn' (never recorded as such — the engine logs them as bet/raise/call) move no chips.
        break;
      }
      default:
        break;
    }
  });
  return { steps, final: { committed, folded, board, reachedShowdown } };
}

/** Seat role of every dealt player, from the button's seat and who was dealt in. */
export function seatPositions(record: HandRecord): ReadonlyMap<PlayerId, Position> {
  const seatCount = Math.max(...record.players.map((p) => p.seat)) + 1;
  const clockwise = [...record.players].sort(
    (a, b) =>
      ((a.seat - record.dealerIndex + seatCount) % seatCount) -
      ((b.seat - record.dealerIndex + seatCount) % seatCount),
  );
  // The gateway always moves the button to a seat with chips, so the first
  // dealt seat from the button is the button itself; should a record ever say
  // otherwise, that seat is the closest stand-in.
  const positions = new Map<PlayerId, Position>();
  clockwise.forEach((player, index) => {
    positions.set(player.id, positionOf(index, clockwise.length));
  });
  return positions;
}
