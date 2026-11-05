import { toChips, toPlayerId } from '@poker/engine';
import type { PlayerView } from './index.js';

/** A heads-up view with sensible defaults; tests override only what they exercise. */
export function sampleView(overrides: Partial<PlayerView> = {}): PlayerView {
  return {
    playerId: toPlayerId('bot'),
    holeCards: [],
    communityCards: [],
    potSize: toChips(30),
    toCall: toChips(0),
    currentBet: toChips(0),
    minRaise: toChips(10),
    bigBlind: toChips(10),
    stack: toChips(1000),
    committedThisStreet: toChips(0),
    street: 'preflop',
    position: 'btn',
    playersDealtIn: 2,
    opponents: [
      {
        playerId: toPlayerId('villain'),
        stack: toChips(1000),
        committedThisStreet: toChips(0),
        position: 'bb',
        allIn: false,
      },
    ],
    history: [],
    ...overrides,
  };
}
