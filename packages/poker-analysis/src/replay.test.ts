import { toPlayerId } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { bet, buildRecord, call, check, fold, post, raise, street } from './record-builder.js';
import { replayActions, seatPositions } from './replay.js';

describe('replayActions', () => {
  it('tracks pot, price and commitments before every action', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'Ah Kh' },
        { id: 'bot', cards: 'Qs Qd' },
      ],
      events: [
        post('hero', 5, 'smallBlind'),
        post('bot', 10, 'bigBlind'),
        raise('hero', 30),
        call('bot'),
        street('flop', '2h 7h Jc'),
        check('bot'),
        bet('hero', 40),
        fold('bot'),
        { type: 'handEnded' },
      ],
    });
    const steps = replayActions(record);

    expect(steps.map((s) => [s.playerId, s.street, s.potBefore, s.toCall])).toEqual([
      ['hero', 'preflop', 15, 5],
      ['bot', 'preflop', 40, 20],
      ['bot', 'flop', 60, 0],
      ['hero', 'flop', 60, 0],
      ['bot', 'flop', 100, 40],
    ]);
    expect(steps[0]?.raisesBefore).toBe(0);
    expect(steps[0]?.committedThisStreetBefore).toBe(5);
    expect(steps[1]?.raisesBefore).toBe(1);
    expect(steps[2]?.board).toHaveLength(3);
    expect(steps[2]?.currentBet).toBe(0);
    expect(steps[4]?.committed.get(toPlayerId('hero'))).toBe(70);
    expect(steps[3]?.eventIndex).toBe(6);
  });

  it('caps the price at the stack and marks all-in players', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'Ah Kh' },
        { id: 'bot', cards: 'Qs Qd', stack: 20 },
      ],
      events: [
        post('hero', 5, 'smallBlind'),
        post('bot', 10, 'bigBlind'),
        raise('hero', 100),
        call('bot'),
        { type: 'handEnded' },
      ],
    });
    const [, botCall] = replayActions(record);

    expect(botCall?.toCall).toBe(10);
    expect(botCall?.stackBefore).toBe(10);
    expect(botCall?.minRaise).toBe(90);
  });

  it('only resets the street on a dealing street, not on the step into showdown', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'Ah Kh' },
        { id: 'bot', cards: 'Qs Qd' },
      ],
      events: [
        post('hero', 5, 'smallBlind'),
        post('bot', 10, 'bigBlind'),
        call('hero'),
        check('bot'),
        street('flop', '2h 7h Jc'),
        street('turn', '9d'),
        street('river', '3s'),
        check('bot'),
        street('showdown'),
        { type: 'handEnded' },
      ],
    });
    const last = replayActions(record).at(-1);
    expect(last?.street).toBe('river');
    expect(last?.board).toHaveLength(5);
  });
});

describe('seatPositions', () => {
  it('names seats from the button', () => {
    const record = buildRecord({
      dealerIndex: 2,
      seats: [
        { id: 'a', cards: 'Ah Kh' },
        { id: 'b', cards: 'Qs Qd' },
        { id: 'c', cards: '2c 3d' },
      ],
      events: [],
    });
    const positions = seatPositions(record);
    expect(positions.get(toPlayerId('c'))).toBe('btn');
    expect(positions.get(toPlayerId('a'))).toBe('sb');
    expect(positions.get(toPlayerId('b'))).toBe('bb');
  });

  it('falls back to the first dealt seat after an undealt button', () => {
    const base = buildRecord({
      seats: [
        { id: 'a', cards: 'Ah Kh' },
        { id: 'b', cards: 'Qs Qd' },
        { id: 'c', cards: '2c 3d' },
      ],
      events: [],
    });
    // Seat 0 busted and was not dealt in; the button stayed there.
    const record = { ...base, players: base.players.slice(1), dealerIndex: 0 };
    const positions = seatPositions(record);
    expect(positions.get(toPlayerId('b'))).toBe('btn');
    expect(positions.get(toPlayerId('c'))).toBe('bb');
  });
});
