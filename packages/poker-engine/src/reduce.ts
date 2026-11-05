import type { Card, Chips, PlayerId, Result, Rng } from './types.js';
import { assertNever, err, ok, toChips } from './types.js';
import { createDeck, drawCard, shuffleDeck, type Deck } from './deck.js';
import type { BlindsConfig, GameState, SeatedPlayer, Street } from './state.js';
import type { ActionInput, EngineCommand } from './commands.js';
import type { EngineEvent } from './events.js';
import type { EngineError } from './errors.js';
import { computeSidePots, splitPotAmong, type Pot } from './pots.js';

export interface EngineDeps {
  readonly rng: Rng;
}

export interface CreateInitialStateInput {
  readonly playerIds: readonly PlayerId[];
  readonly startingStack: Chips;
  readonly blinds: BlindsConfig;
  readonly dealerIndex?: number;
}

export function createInitialState(input: CreateInitialStateInput): GameState {
  const dealerIndex = input.dealerIndex ?? 0;
  const players: SeatedPlayer[] = input.playerIds.map((id) => ({
    id,
    stack: input.startingStack,
    holeCards: [],
    status: 'active',
    committedThisStreet: toChips(0),
    committedTotal: toChips(0),
  }));

  return {
    street: 'idle',
    deck: [],
    communityCards: [],
    players,
    dealerIndex,
    firstToActPostflopIndex: dealerIndex,
    toAct: [],
    actingPlayerId: null,
    blinds: input.blinds,
    pot: toChips(0),
    currentBet: toChips(0),
    minRaise: input.blinds.bigBlind,
    handNumber: 0,
  };
}

type EngineResult = Result<
  { readonly state: GameState; readonly events: readonly EngineEvent[] },
  EngineError
>;

export function reduce(state: GameState, command: EngineCommand, deps: EngineDeps): EngineResult {
  switch (command.type) {
    case 'startHand':
      return handleStartHand(state, deps.rng);
    case 'playerAction':
      return handlePlayerAction(state, command.playerId, command.action);
    case 'advanceStreet':
      return handleAdvanceStreet(state);
    case 'resolveShowdown':
      return handleResolveShowdown(state, command.rankedGroups);
    default:
      return assertNever(command);
  }
}

function isSeated(p: SeatedPlayer | undefined): p is SeatedPlayer {
  return p !== undefined;
}

/** Seats starting at (and including) `startIndex`, walking clockwise, matching `predicate`. */
function orderFrom(
  players: readonly SeatedPlayer[],
  startIndex: number,
  predicate: (p: SeatedPlayer) => boolean,
): PlayerId[] {
  const n = players.length;
  const ordered: PlayerId[] = [];
  for (let offset = 0; offset < n; offset++) {
    const player = players[(startIndex + offset) % n];
    if (isSeated(player) && predicate(player)) {
      ordered.push(player.id);
    }
  }
  return ordered;
}

function findNextEligibleIndex(
  players: readonly SeatedPlayer[],
  fromIndex: number,
  predicate: (p: SeatedPlayer) => boolean,
): number | null {
  const n = players.length;
  for (let offset = 1; offset <= n; offset++) {
    const idx = (fromIndex + offset) % n;
    const player = players[idx];
    if (isSeated(player) && predicate(player)) {
      return idx;
    }
  }
  return null;
}

interface BlindSeats {
  readonly sbIndex: number;
  readonly bbIndex: number;
  readonly firstToActPreflop: number;
  readonly firstToActPostflop: number;
}

/** Heads-up: button is SB and acts first preflop. 3+: standard SB/BB/UTG order. */
function resolveBlindSeats(
  players: readonly SeatedPlayer[],
  dealerIndex: number,
): Result<BlindSeats, EngineError> {
  const isEligible = (p: SeatedPlayer): boolean => p.stack > 0;
  const eligibleCount = players.filter(isEligible).length;
  if (eligibleCount < 2) {
    return err({ code: 'notEnoughPlayers' });
  }

  if (eligibleCount === 2) {
    const sbIndex = dealerIndex;
    const bbIndex = findNextEligibleIndex(players, dealerIndex, isEligible);
    if (bbIndex === null) {
      return err({ code: 'notEnoughPlayers' });
    }
    return ok({ sbIndex, bbIndex, firstToActPreflop: sbIndex, firstToActPostflop: bbIndex });
  }

  const sbIndex = findNextEligibleIndex(players, dealerIndex, isEligible);
  if (sbIndex === null) {
    return err({ code: 'notEnoughPlayers' });
  }
  const bbIndex = findNextEligibleIndex(players, sbIndex, isEligible);
  if (bbIndex === null) {
    return err({ code: 'notEnoughPlayers' });
  }
  const firstToActPreflop = findNextEligibleIndex(players, bbIndex, isEligible);
  if (firstToActPreflop === null) {
    return err({ code: 'notEnoughPlayers' });
  }

  return ok({ sbIndex, bbIndex, firstToActPreflop, firstToActPostflop: sbIndex });
}

function dealHoleCards(
  deck: Deck,
  order: readonly PlayerId[],
): { readonly deck: Deck; readonly hands: ReadonlyMap<PlayerId, readonly Card[]> } {
  const hands = new Map<PlayerId, Card[]>();
  for (const id of order) {
    hands.set(id, []);
  }

  let remaining = deck;
  for (let round = 0; round < 2; round++) {
    for (const id of order) {
      const { card, remaining: rest } = drawCard(remaining);
      remaining = rest;
      const hand = hands.get(id);
      if (hand) {
        hand.push(card);
      }
    }
  }

  return { deck: remaining, hands };
}

function handleStartHand(state: GameState, rng: Rng): EngineResult {
  if (state.street !== 'idle') {
    return err({ code: 'handAlreadyInProgress' });
  }

  let players: SeatedPlayer[] = state.players.map((p) =>
    p.stack > 0
      ? {
          ...p,
          status: 'active',
          holeCards: [],
          committedThisStreet: toChips(0),
          committedTotal: toChips(0),
        }
      : {
          ...p,
          status: 'sittingOut',
          holeCards: [],
          committedThisStreet: toChips(0),
          committedTotal: toChips(0),
        },
  );

  const seatsResult = resolveBlindSeats(players, state.dealerIndex);
  if (!seatsResult.ok) {
    return seatsResult;
  }
  const { sbIndex, bbIndex, firstToActPreflop, firstToActPostflop } = seatsResult.value;

  const events: EngineEvent[] = [
    { type: 'handStarted', handNumber: state.handNumber + 1, dealerIndex: state.dealerIndex },
  ];
  let pot = 0;

  const applyPost = (
    index: number,
    amount: number,
    kind: 'ante' | 'smallBlind' | 'bigBlind',
    countsTowardStreet: boolean,
  ): void => {
    const current = players[index];
    if (!current || amount <= 0 || current.stack <= 0) {
      return;
    }
    const posted = Math.min(amount, current.stack);
    const isAllIn = posted === current.stack;
    const updated: SeatedPlayer = {
      ...current,
      stack: toChips(current.stack - posted),
      committedThisStreet: countsTowardStreet
        ? toChips(current.committedThisStreet + posted)
        : current.committedThisStreet,
      committedTotal: toChips(current.committedTotal + posted),
      status: isAllIn ? 'allIn' : current.status,
    };
    players = players.map((p, i) => (i === index ? updated : p));
    pot += posted;
    events.push({ type: 'blindsPosted', playerId: current.id, amount: toChips(posted), kind });
  };

  if (state.blinds.ante > 0) {
    players.forEach((_p, index) => {
      applyPost(index, state.blinds.ante, 'ante', false);
    });
  }

  applyPost(sbIndex, state.blinds.smallBlind, 'smallBlind', true);
  applyPost(bbIndex, state.blinds.bigBlind, 'bigBlind', true);

  const dealOrder = orderFrom(
    players,
    sbIndex,
    (p) => p.status === 'active' || p.status === 'allIn',
  );
  const shuffled = shuffleDeck(createDeck(), rng);
  const { deck, hands } = dealHoleCards(shuffled, dealOrder);

  players = players.map((p) => {
    const cards = hands.get(p.id);
    return cards ? { ...p, holeCards: cards } : p;
  });

  for (const id of dealOrder) {
    const cards = hands.get(id);
    if (cards) {
      events.push({ type: 'cardsDealt', playerId: id, cards });
    }
  }

  const toAct = orderFrom(players, firstToActPreflop, (p) => p.status === 'active');

  return ok({
    state: {
      ...state,
      street: 'preflop',
      deck,
      communityCards: [],
      players,
      firstToActPostflopIndex: firstToActPostflop,
      toAct,
      actingPlayerId: toAct[0] ?? null,
      pot: toChips(pot),
      currentBet: state.blinds.bigBlind,
      minRaise: state.blinds.bigBlind,
      handNumber: state.handNumber + 1,
    },
    events,
  });
}

function handlePlayerAction(
  state: GameState,
  playerId: PlayerId,
  action: ActionInput,
): EngineResult {
  if (state.street === 'idle' || state.street === 'showdown') {
    return err({ code: 'noHandInProgress' });
  }

  const current = state.toAct[0] ?? null;
  if (current !== playerId) {
    return err({ code: 'notPlayersTurn', expected: current, actual: playerId });
  }

  const index = state.players.findIndex((p) => p.id === playerId);
  const player = state.players[index];
  if (index === -1 || !player) {
    return err({ code: 'unknownPlayer', playerId });
  }

  const toCall = state.currentBet - player.committedThisStreet;

  switch (action.kind) {
    case 'fold':
      return applyFold(state, index);

    case 'check':
      if (toCall > 0) {
        return err({ code: 'illegalAction', reason: 'Cannot check facing a bet' });
      }
      return applyPassive(state, { type: 'actionTaken', playerId, action });

    case 'call':
      if (toCall <= 0) {
        return err({ code: 'illegalAction', reason: 'Nothing to call' });
      }
      return applyCall(state, index, toCall);

    case 'bet':
      if (state.currentBet > 0) {
        return err({ code: 'illegalAction', reason: 'A bet is already on the table, use raise' });
      }
      return applyBetOrRaise(state, index, action.amount, action.amount, true);

    case 'raise':
      if (state.currentBet <= 0) {
        return err({ code: 'illegalAction', reason: 'No bet to raise, use bet' });
      }
      if (action.amount <= state.currentBet) {
        return err({ code: 'illegalAction', reason: 'Raise must increase the current bet' });
      }
      return applyBetOrRaise(
        state,
        index,
        action.amount - player.committedThisStreet,
        action.amount,
        false,
      );

    case 'allIn': {
      if (player.stack <= 0) {
        return err({ code: 'illegalAction', reason: 'No chips left to move all-in' });
      }
      const resultingTotal = player.committedThisStreet + player.stack;
      if (resultingTotal > state.currentBet) {
        return applyBetOrRaise(state, index, player.stack, resultingTotal, state.currentBet === 0);
      }
      return applyCall(state, index, player.stack);
    }

    default:
      return assertNever(action);
  }
}

function applyFold(state: GameState, index: number): EngineResult {
  const player = state.players[index];
  if (!player) {
    return err({ code: 'unknownPlayer', playerId: state.toAct[0] ?? ('' as PlayerId) });
  }

  const players = state.players.map((p, i) =>
    i === index ? { ...p, status: 'folded' as const } : p,
  );
  const toAct = state.toAct.slice(1);
  const events: EngineEvent[] = [
    { type: 'actionTaken', playerId: player.id, action: { kind: 'fold' } },
  ];

  const remaining = players.filter((p) => p.status === 'active' || p.status === 'allIn');
  if (remaining.length === 1) {
    const winner = remaining[0];
    if (!winner) {
      return err({ code: 'illegalAction', reason: 'No players remain in the hand' });
    }
    const awarded = awardAllPotsTo(players, winner.id);
    events.push(...awarded.events);
    events.push({ type: 'handEnded' });
    return ok({
      state: {
        ...state,
        players: awarded.players,
        communityCards: [],
        pot: toChips(0),
        street: 'idle',
        toAct: [],
        actingPlayerId: null,
      },
      events,
    });
  }

  return ok({ state: { ...state, players, toAct, actingPlayerId: toAct[0] ?? null }, events });
}

function applyPassive(state: GameState, event: EngineEvent): EngineResult {
  const toAct = state.toAct.slice(1);
  return ok({ state: { ...state, toAct, actingPlayerId: toAct[0] ?? null }, events: [event] });
}

function applyCall(state: GameState, index: number, requestedChips: number): EngineResult {
  const player = state.players[index];
  if (!player) {
    return err({ code: 'unknownPlayer', playerId: state.toAct[0] ?? ('' as PlayerId) });
  }

  const chips = Math.min(requestedChips, player.stack);
  const isAllIn = chips === player.stack;
  const updated: SeatedPlayer = {
    ...player,
    stack: toChips(player.stack - chips),
    committedThisStreet: toChips(player.committedThisStreet + chips),
    committedTotal: toChips(player.committedTotal + chips),
    status: isAllIn ? 'allIn' : player.status,
  };
  const players = state.players.map((p, i) => (i === index ? updated : p));
  const toAct = state.toAct.slice(1);

  return ok({
    state: {
      ...state,
      players,
      pot: toChips(state.pot + chips),
      toAct,
      actingPlayerId: toAct[0] ?? null,
    },
    events: [{ type: 'actionTaken', playerId: player.id, action: { kind: 'call' } }],
  });
}

/**
 * Covers bet, raise and all-in-as-raise. `chipsToPutIn` moves from stack to pot now;
 * `resultingCommittedThisStreet` is the player's new total commitment this street.
 * A raise that falls short of `minRaise` only because the player is all-in does not
 * reopen the action for players who already matched the previous bet.
 */
function applyBetOrRaise(
  state: GameState,
  index: number,
  chipsToPutIn: number,
  resultingCommittedThisStreet: number,
  isFreshBet: boolean,
): EngineResult {
  const player = state.players[index];
  if (!player) {
    return err({ code: 'unknownPlayer', playerId: state.toAct[0] ?? ('' as PlayerId) });
  }
  if (chipsToPutIn > player.stack) {
    return err({ code: 'illegalAction', reason: 'Not enough chips' });
  }

  const isAllIn = chipsToPutIn === player.stack;
  const increase = resultingCommittedThisStreet - state.currentBet;

  if (!isAllIn) {
    if (isFreshBet && chipsToPutIn < state.blinds.bigBlind) {
      return err({ code: 'illegalAction', reason: 'Bet must be at least the big blind' });
    }
    if (!isFreshBet && increase < state.minRaise) {
      return err({
        code: 'illegalAction',
        reason: `Raise must increase the bet by at least ${String(state.minRaise)}`,
      });
    }
  }

  const isFullRaise = isFreshBet || increase >= state.minRaise;

  const updated: SeatedPlayer = {
    ...player,
    stack: toChips(player.stack - chipsToPutIn),
    committedThisStreet: toChips(resultingCommittedThisStreet),
    committedTotal: toChips(player.committedTotal + chipsToPutIn),
    status: isAllIn ? 'allIn' : player.status,
  };
  const players = state.players.map((p, i) => (i === index ? updated : p));

  const toAct = isFullRaise
    ? orderFrom(players, index + 1, (p) => p.status === 'active' && p.id !== updated.id)
    : state.toAct.slice(1);

  const actionKind: ActionInput = isFreshBet
    ? { kind: 'bet', amount: toChips(resultingCommittedThisStreet) }
    : { kind: 'raise', amount: toChips(resultingCommittedThisStreet) };

  return ok({
    state: {
      ...state,
      players,
      pot: toChips(state.pot + chipsToPutIn),
      currentBet: toChips(resultingCommittedThisStreet),
      minRaise: isFullRaise ? toChips(increase) : state.minRaise,
      toAct,
      actingPlayerId: toAct[0] ?? null,
    },
    events: [{ type: 'actionTaken', playerId: player.id, action: actionKind }],
  });
}

const STREET_DEAL_COUNT: Readonly<Record<'preflop' | 'flop' | 'turn' | 'river', number>> = {
  preflop: 3,
  flop: 1,
  turn: 1,
  river: 0,
};

const NEXT_STREET: Readonly<Record<'preflop' | 'flop' | 'turn' | 'river', Street>> = {
  preflop: 'flop',
  flop: 'turn',
  turn: 'river',
  river: 'showdown',
};

function handleAdvanceStreet(state: GameState): EngineResult {
  if (state.street === 'idle' || state.street === 'showdown') {
    return err({ code: 'noHandInProgress' });
  }
  if (state.toAct.length > 0) {
    return err({ code: 'bettingRoundNotComplete' });
  }

  let deck = state.deck;
  const dealt: Card[] = [];
  for (let i = 0; i < STREET_DEAL_COUNT[state.street]; i++) {
    const { card, remaining } = drawCard(deck);
    deck = remaining;
    dealt.push(card);
  }

  const players = state.players.map((p) => ({ ...p, committedThisStreet: toChips(0) }));
  const nextStreet = NEXT_STREET[state.street];
  const toAct =
    nextStreet === 'showdown'
      ? []
      : orderFrom(players, state.firstToActPostflopIndex, (p) => p.status === 'active');

  return ok({
    state: {
      ...state,
      street: nextStreet,
      deck,
      communityCards: [...state.communityCards, ...dealt],
      players,
      currentBet: toChips(0),
      minRaise: state.blinds.bigBlind,
      toAct,
      actingPlayerId: toAct[0] ?? null,
    },
    events: [{ type: 'streetAdvanced', street: nextStreet, communityCards: dealt }],
  });
}

/** Every side pot, regardless of layering, has exactly one claimant. */
function awardAllPotsTo(
  players: readonly SeatedPlayer[],
  winnerId: PlayerId,
): { readonly players: readonly SeatedPlayer[]; readonly events: readonly EngineEvent[] } {
  const pots = computeSidePots(players);
  const events: EngineEvent[] = [];
  let totalAwarded = 0;
  for (const pot of pots) {
    events.push({ type: 'potAwarded', playerId: winnerId, amount: pot.amount });
    totalAwarded += pot.amount;
  }

  const updatedPlayers = players.map((p) =>
    p.id === winnerId ? { ...p, stack: toChips(p.stack + totalAwarded) } : p,
  );
  return { players: updatedPlayers, events };
}

/**
 * A pot with a single eligible player is uncontested and needs no ranking.
 * Otherwise the strongest ranked group that overlaps the pot's eligible set
 * wins it — ties within that group split it evenly.
 */
function resolvePotWinners(
  pot: Pot,
  rankedGroups: readonly (readonly PlayerId[])[],
): readonly PlayerId[] {
  if (pot.eligiblePlayerIds.length <= 1) {
    return pot.eligiblePlayerIds;
  }
  for (const group of rankedGroups) {
    const winners = group.filter((id) => pot.eligiblePlayerIds.includes(id));
    if (winners.length > 0) {
      return winners;
    }
  }
  return [];
}

function handleResolveShowdown(
  state: GameState,
  rankedGroups: readonly (readonly PlayerId[])[],
): EngineResult {
  if (state.street !== 'showdown') {
    return err({ code: 'notAtShowdown' });
  }

  const pots = computeSidePots(state.players);
  // Odd chips go to the first eligible winner left of the button (CLAUDE.md §1).
  const seatOrder = orderFrom(state.players, state.dealerIndex + 1, () => true);

  const events: EngineEvent[] = [];
  const totalAwarded = new Map<PlayerId, number>();

  for (const pot of pots) {
    const winners = resolvePotWinners(pot, rankedGroups);
    if (winners.length === 0) {
      return err({ code: 'noRankingForEligiblePlayers', eligiblePlayerIds: pot.eligiblePlayerIds });
    }

    const winnersInSeatOrder = seatOrder.filter((id) => winners.includes(id));
    const shares = splitPotAmong(pot.amount, winnersInSeatOrder);
    for (const [playerId, amount] of shares) {
      totalAwarded.set(playerId, (totalAwarded.get(playerId) ?? 0) + amount);
      events.push({ type: 'potAwarded', playerId, amount });
    }
  }

  const players = state.players.map((p) => {
    const won = totalAwarded.get(p.id);
    return won ? { ...p, stack: toChips(p.stack + won) } : p;
  });
  events.push({ type: 'handEnded' });

  return ok({
    state: {
      ...state,
      players,
      pot: toChips(0),
      street: 'idle',
      communityCards: [],
      toAct: [],
      actingPlayerId: null,
    },
    events,
  });
}
