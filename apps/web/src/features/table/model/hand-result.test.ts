import { describe, expect, it } from 'vitest';
import type { ProjectedState, ServerEvent } from '@poker/protocol';
import { toChips, toPlayerId } from '@poker/engine';
import { formatPlayerName, gameOutcome, summarizeLastHand } from './hand-result.js';

const me = toPlayerId('local-player');
const bot = toPlayerId('bot-2');

const started: ServerEvent = { type: 'handStarted', handNumber: 1 };
const ended: ServerEvent = { type: 'handEnded' };
const award = (playerId: typeof me, amount: number): ServerEvent => ({
  type: 'potAwarded',
  playerId,
  amount: toChips(amount),
});

describe('summarizeLastHand', () => {
  it('is null until the hand has ended', () => {
    expect(summarizeLastHand([started], me)).toBeNull();
    expect(summarizeLastHand([], me)).toBeNull();
  });

  it('sums pots per player, biggest first, and reports the local share', () => {
    const result = summarizeLastHand([started, award(bot, 300), award(bot, 100), ended], me);
    expect(result?.winners).toEqual([{ playerId: bot, amount: 400 }]);
    expect(result?.localAmount).toBe(0);
  });

  it('only counts the most recent hand', () => {
    const log = [started, award(me, 50), ended, started, award(bot, 80), ended];
    expect(summarizeLastHand(log, me)?.winners).toEqual([{ playerId: bot, amount: 80 }]);
  });
});

describe('formatPlayerName', () => {
  it('labels the viewer and prettifies bot ids', () => {
    expect(formatPlayerName('local-player', 'local-player', 'Ви')).toBe('Ви');
    expect(formatPlayerName('bot-2', 'local-player', 'Ви')).toBe('Bot 2');
  });
});

function snapshot(
  stacks: Record<string, number>,
  street: ProjectedState['street'],
): ProjectedState {
  return {
    viewerId: me,
    street,
    communityCards: [],
    players: Object.entries(stacks).map(([id, stack]) => ({
      id: toPlayerId(id),
      stack: toChips(stack),
      status: 'active',
      committedThisStreet: toChips(0),
      committedTotal: toChips(0),
      holeCards: null,
    })),
    dealerIndex: 0,
    toAct: [],
    actingPlayerId: null,
    pot: toChips(0),
    currentBet: toChips(0),
    minRaise: toChips(10),
    blinds: { smallBlind: toChips(5), bigBlind: toChips(10), ante: toChips(0) },
    handNumber: 1,
  };
}

describe('gameOutcome', () => {
  it('is busted when the local player has no chips between hands', () => {
    expect(gameOutcome(snapshot({ 'local-player': 0, 'bot-2': 400 }, 'idle'))).toBe('busted');
  });

  it('is won when every opponent is out', () => {
    expect(gameOutcome(snapshot({ 'local-player': 400, 'bot-2': 0 }, 'idle'))).toBe('won');
  });

  it('keeps playing while 2+ players have chips, and never ends a hand in progress', () => {
    expect(gameOutcome(snapshot({ 'local-player': 100, 'bot-2': 300 }, 'idle'))).toBe('playing');
    expect(gameOutcome(snapshot({ 'local-player': 0, 'bot-2': 400 }, 'flop'))).toBe('playing');
  });
});
