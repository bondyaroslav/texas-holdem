import { describe, expect, it } from 'vitest';
import type { ProjectedState, ServerEvent } from '@poker/protocol';
import { createSoundCueTracker } from './sound-cues.js';

type PlayerId = ProjectedState['viewerId'];
const hero = 'p0' as PlayerId;
const bot = 'p1' as PlayerId;

function snapshot(actingPlayerId: PlayerId | null, stacks: Record<string, number>): ServerEvent {
  return {
    type: 'stateChanged',
    snapshot: {
      actingPlayerId,
      players: Object.entries(stacks).map(([id, stack]) => ({ id, stack })),
    } as unknown as ProjectedState,
  };
}

function run(events: readonly ServerEvent[]): string[] {
  const tracker = createSoundCueTracker(() => hero);
  return events.flatMap((event) => tracker.next(event));
}

describe('createSoundCueTracker', () => {
  it('maps a hand to sounds', () => {
    expect(
      run([
        { type: 'handStarted', handNumber: 1 },
        { type: 'cardsDealt', playerId: hero, cards: [] },
        { type: 'cardsDealt', playerId: bot, cards: [] },
        snapshot(hero, { p0: 100, p1: 100 }),
        { type: 'actionTaken', playerId: hero, action: { kind: 'check' } },
        snapshot(bot, { p0: 100, p1: 100 }),
        { type: 'actionTaken', playerId: bot, action: { kind: 'fold' } },
        { type: 'streetAdvanced', street: 'flop', communityCards: [] },
        { type: 'streetAdvanced', street: 'turn', communityCards: [] },
        { type: 'streetAdvanced', street: 'showdown', communityCards: [] },
        { type: 'potAwarded', playerId: hero, amount: 10 as never },
        { type: 'potAwarded', playerId: bot, amount: 10 as never },
      ]),
    ).toEqual(['deal', 'yourTurn', 'check', 'fold', 'flop', 'board', 'win', 'potOther']);
  });

  it('tells chips from an all-in by the stack in the next snapshot', () => {
    expect(
      run([
        { type: 'actionTaken', playerId: bot, action: { kind: 'raise', amount: 40 as never } },
        snapshot(null, { p0: 100, p1: 60 }),
        { type: 'actionTaken', playerId: bot, action: { kind: 'call' } },
        snapshot(null, { p0: 100, p1: 0 }),
        { type: 'actionTaken', playerId: hero, action: { kind: 'allIn' } },
      ]),
    ).toEqual(['chips', 'allIn', 'allIn']);
  });

  it('chimes once per turn, not on every snapshot', () => {
    expect(
      run([
        snapshot(hero, { p0: 100 }),
        snapshot(hero, { p0: 100 }),
        snapshot(bot, { p0: 100 }),
        snapshot(hero, { p0: 100 }),
      ]),
    ).toEqual(['yourTurn', 'yourTurn']);
  });
});
