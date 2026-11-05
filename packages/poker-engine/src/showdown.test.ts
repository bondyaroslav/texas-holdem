import { describe, expect, it } from 'vitest';
import { rankPlayersForShowdown } from './showdown.js';
import { toPlayerId } from './types.js';
import type { Card, Suit } from './types.js';

const SUIT_CHARS: Record<string, Suit> = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };

function parseCard(token: string): Card {
  const rank = token.slice(0, -1);
  const suitChar = token.slice(-1);
  const suit = SUIT_CHARS[suitChar];
  if (!suit) {
    throw new Error(`Unknown suit in card token "${token}"`);
  }
  return { rank: rank as Card['rank'], suit };
}

function cards(spec: string): Card[] {
  return spec.trim().split(/\s+/).map(parseCard);
}

describe('rankPlayersForShowdown', () => {
  it('ranks a clear winner alone, strongest first', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const board = cards('2H 7S 9D JC 3C');
    const hands = new Map([
      [alice, cards('AH AS')], // top pair aces
      [bob, cards('4D 5D')], // nothing
    ]);

    const groups = rankPlayersForShowdown(hands, board);
    expect(groups).toEqual([[alice], [bob]]);
  });

  it('groups players with the exact same best hand into one tie group', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const carol = toPlayerId('carol');
    const board = cards('AH KH QH JH TH'); // the board alone is a royal flush
    const hands = new Map([
      [alice, cards('2C 3D')],
      [bob, cards('4S 5C')],
      [carol, cards('6D 7H')], // 7H is part of the flush suit but doesn't improve a royal flush
    ]);

    const groups = rankPlayersForShowdown(hands, board);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
    expect(new Set(groups[0])).toEqual(new Set([alice, bob, carol]));
  });

  it('orders three-way hands from strongest to weakest', () => {
    const alice = toPlayerId('alice');
    const bob = toPlayerId('bob');
    const carol = toPlayerId('carol');
    const board = cards('2H 2S 9D JC 3C');
    const hands = new Map([
      [alice, cards('2C 2D')], // quads (2-2-2-2)
      [bob, cards('9H 9C')], // full house 9s over 2s
      [carol, cards('AH KS')], // just a pair of twos with the board
    ]);

    const groups = rankPlayersForShowdown(hands, board);
    expect(groups).toEqual([[alice], [bob], [carol]]);
  });
});
