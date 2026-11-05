import type { HandRange, Position } from '@poker/ai';
import { toPlayerId, type Card, type EngineEvent } from '@poker/engine';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_CONFIG } from '../analysis-config.js';
import { bet, buildRecord, call, check, post, raise, street } from '../record-builder.js';
import { replayActions } from '../replay.js';
import { cards, hand } from '../test-helpers.js';
import { hasDraw, keepTopFraction, narrowRange, rankRange } from '@poker/ai';

const size = (range: HandRange): number => range.reduce((sum, c) => sum + (c.weight ?? 1), 0);
const share = (range: HandRange, test: (hole: readonly Card[]) => boolean): number =>
  range.filter((c) => test(c.cards)).reduce((sum, c) => sum + (c.weight ?? 1), 0) / size(range);
const hasRank =
  (rank: Card['rank']) =>
  (hole: readonly Card[]): boolean =>
    hole.some((c) => c.rank === rank);

function rangeAfter(
  events: readonly EngineEvent[],
  options: { position?: Position; blocked?: string; untilEventIndex?: number } = {},
): HandRange {
  const record = buildRecord({
    seats: [
      { id: 'hero', cards: '9c 8d' },
      { id: 'bot', cards: 'Qs Qd' },
    ],
    events,
  });
  return narrowRange({
    steps: replayActions(record),
    villainId: toPlayerId('bot'),
    untilEventIndex: options.untilEventIndex ?? Number.POSITIVE_INFINITY,
    blocked: cards(options.blocked ?? '9c 8d'),
    position: options.position ?? 'btn',
    playerCount: 6,
    bigBlind: 10,
    preflop: DEFAULT_ANALYSIS_CONFIG.preflopNarrowing,
    postflop: DEFAULT_ANALYSIS_CONFIG.postflopNarrowing,
  });
}

const blinds = [post('hero', 5, 'smallBlind'), post('bot', 10, 'bigBlind')];

describe('narrowRange — preflop', () => {
  it('starts from every combo the hero cannot see', () => {
    const range = rangeAfter(blinds);
    // C(50, 2): the hero's two cards are blocked.
    expect(range).toHaveLength(1225);
    expect(
      range.some((c) => c.cards.some((card) => card.rank === '9' && card.suit === 'clubs')),
    ).toBe(false);
  });

  it('reads an early-position open as tighter than a button open', () => {
    const open = [...blinds, raise('bot', 30)];
    const utg = size(rangeAfter(open, { position: 'utg' }));
    const btn = size(rangeAfter(open, { position: 'btn' }));
    expect(utg).toBeLessThan(btn);
    expect(utg / 1225).toBeCloseTo(0.14, 1);
  });

  it('reads a 3-bet, and an oversized open, as tighter than a standard open', () => {
    const open = size(rangeAfter([...blinds, raise('bot', 30)], { position: 'co' }));
    const huge = size(rangeAfter([...blinds, raise('bot', 80)], { position: 'co' }));
    const threeBet = size(
      rangeAfter([...blinds, raise('hero', 30), raise('bot', 90)], { position: 'bb' }),
    );
    expect(huge).toBeLessThan(open);
    expect(threeBet).toBeLessThan(open);
  });

  it('keeps few premium hands in a flat-calling range', () => {
    const calling = rangeAfter([...blinds, raise('hero', 30), call('bot')], { position: 'bb' });
    const aces = calling.filter((c) => c.cards.every((card) => card.rank === 'A'));
    expect(aces.length).toBeGreaterThan(0);
    expect(aces.every((c) => (c.weight ?? 1) < 0.2)).toBe(true);
    expect(calling.some((c) => (c.weight ?? 1) === 1)).toBe(true);
  });

  it('downweights strong hands when the big blind just checks', () => {
    const checked = rangeAfter([...blinds, call('hero'), check('bot')], { position: 'bb' });
    expect(share(checked, hasRank('A'))).toBeLessThan(share(rangeAfter(blinds), hasRank('A')));
  });

  it('ignores actions at or after the decision point', () => {
    const range = rangeAfter([...blinds, raise('bot', 30)], {
      position: 'utg',
      untilEventIndex: 2,
    });
    expect(range).toHaveLength(1225);
  });
});

describe('narrowRange — postflop', () => {
  const toFlop = [...blinds, raise('hero', 30), call('bot'), street('flop', 'Ah 7c 2d')];
  const flopBlocked = '9c 8d Ah 7c 2d';

  it('a big bet concentrates the range on strong hands', () => {
    const before = rangeAfter(toFlop, { position: 'bb', blocked: flopBlocked });
    const after = rangeAfter([...toFlop, bet('bot', 60)], { position: 'bb', blocked: flopBlocked });
    expect(share(after, hasRank('A'))).toBeGreaterThan(share(before, hasRank('A')));
  });

  it('a check thins out the strongest hands', () => {
    const before = rangeAfter(toFlop, { position: 'bb', blocked: flopBlocked });
    const after = rangeAfter([...toFlop, check('bot')], { position: 'bb', blocked: flopBlocked });
    expect(share(after, hasRank('A'))).toBeLessThan(share(before, hasRank('A')));
  });

  it('a call against a pot-sized bet drops most air', () => {
    const events = [
      ...blinds,
      call('hero'),
      check('bot'),
      street('flop', 'Ah 7c 2d'),
      check('bot'),
      bet('hero', 20),
      call('bot'), // event 7
    ];
    const options = { position: 'bb', blocked: flopBlocked } as const;
    const before = rangeAfter(events, { ...options, untilEventIndex: 7 });
    const after = rangeAfter(events, options);
    expect(size(after)).toBeLessThan(size(before) * 0.6);
    expect(share(after, hasRank('A'))).toBeGreaterThan(share(before, hasRank('A')));
  });
});

describe('strength helpers', () => {
  it('spots flush and straight draws the hole cards contribute to', () => {
    expect(hasDraw(hand('Ah 5h'), cards('9h 7h 2c'))).toBe(true);
    expect(hasDraw(hand('9c 8d'), cards('7h 6s 2c'))).toBe(true);
    expect(hasDraw(hand('Kc Kd'), cards('7h 6s 2c'))).toBe(false);
    // A straight is already made: nothing left to draw to.
    expect(hasDraw(hand('9c 8d'), cards('7h 6s 5c'))).toBe(false);
    // Four to a straight on the board alone is not the hero's draw.
    expect(hasDraw(hand('2c 2d'), cards('9h 8s 7c 6d'))).toBe(false);
    // River: no cards to come.
    expect(hasDraw(hand('Ah 5h'), cards('9h 7h 2c 3d Kc'))).toBe(false);
  });

  it('ranks a range strongest first and keeps the top of it', () => {
    const range = [{ cards: hand('2c 3d') }, { cards: hand('Ac Ad') }, { cards: hand('Kc Kd') }];
    const board = cards('As 7h 9d');
    expect(rankRange(range, board).map((r) => r.combo.cards[0].rank)).toEqual(['A', 'K', '2']);
    expect(keepTopFraction(range, board, 0.4).map((c) => c.cards[0].rank)).toEqual(['A']);
    expect(keepTopFraction(range, board, 0)).toHaveLength(1);
    expect(keepTopFraction(range, board, 1)).toBe(range);
  });

  it('ranks preflop by starting-hand strength', () => {
    const range = [{ cards: hand('7c 2d') }, { cards: hand('Ac Ad') }];
    expect(rankRange(range, []).map((r) => r.combo.cards[0].rank)).toEqual(['A', '7']);
  });
});
