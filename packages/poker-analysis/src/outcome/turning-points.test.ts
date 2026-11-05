import { toPlayerId } from '@poker/engine';
import type { HandOutcome, StreetEquity } from '@poker/protocol';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_CONFIG } from '../analysis-config.js';
import { cards } from '../test-helpers.js';
import { findTurningPoints } from './turning-points.js';

const a = toPlayerId('a');
const b = toPlayerId('b');
const reading = (street: StreetEquity['street'], board: string, ea: number): StreetEquity => ({
  street,
  board: cards(board),
  method: 'exact',
  samples: 1,
  players: [
    { playerId: a, win: ea, tie: 0, equity: ea },
    { playerId: b, win: 1 - ea, tie: 0, equity: 1 - ea },
  ],
});
const outcome = (winner: typeof a, showdown = true): HandOutcome => ({
  showdown,
  players: [],
  pots: [
    {
      amount: 100,
      eligible: [a, b],
      shares: [{ playerId: winner, amount: 100 }],
      decidedBy: 'rank',
      kickerRank: null,
    },
  ],
  foldWin: null,
  allIn: null,
  explanations: [],
});
const thresholds = DEFAULT_ANALYSIS_CONFIG.turningPoints;

describe('findTurningPoints', () => {
  const streets = [
    reading('preflop', '', 0.8),
    reading('flop', '2c 7d 9h', 0.75),
    reading('turn', '2c 7d 9h Js', 0.9),
    reading('river', '2c 7d 9h Js 3c', 0),
  ];

  it('calls out a turn favourite losing on the river as a bad beat for one and a suck-out for the other', () => {
    const points = findTurningPoints(streets, outcome(b), thresholds);

    expect(points).toContainEqual({
      kind: 'badBeat',
      playerId: a,
      street: 'turn',
      equityBefore: 0.9,
      equityAfter: 0,
    });
    expect(points.find((p) => p.kind === 'suckOut')).toMatchObject({
      playerId: b,
      street: 'turn',
      equityAfter: 1,
    });
    // The river card itself is a 90-point swing for both players.
    expect(points.filter((p) => p.kind === 'swing').map((p) => p.street)).toEqual(['turn', 'turn']);
  });

  it('has nothing to explain when the favourite holds or the hand ended without a showdown', () => {
    const held = [...streets.slice(0, 3), reading('river', '2c 7d 9h Js 3c', 1)];
    expect(findTurningPoints(held, outcome(a), thresholds)).toEqual([]);
    expect(findTurningPoints(streets.slice(0, 2), outcome(b, false), thresholds)).toEqual([]);
  });
});
