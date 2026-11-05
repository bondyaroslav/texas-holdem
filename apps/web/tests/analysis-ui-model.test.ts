import { describe, expect, it } from 'vitest';
import { buildTimeline, frameBeforeEvent } from '@/features/hand-review';
import { applyFilters, formatHandText, formatHandsText, NO_FILTERS } from '@/features/history';
import { cumulativeWinnings } from '@/features/stats';
import { makeHandRecord } from './fixtures/hand-record';
import { playHands, toEntry } from './fixtures/played-hands';

describe('buildTimeline', () => {
  it('starts at the deal and ends with the result, one frame per action and street', async () => {
    const [record] = await playHands(3, 1);
    if (!record) throw new Error('no hand');
    const frames = buildTimeline(record);
    const actions = record.events.filter((e) => e.type === 'actionTaken').length;
    const streets = record.events.filter((e) => e.type === 'streetAdvanced').length;

    expect(frames[0]?.message.key).toBe('replay.deal');
    expect(frames.at(-1)?.message.key).toBe('replay.result');
    expect(frames).toHaveLength(1 + actions + streets + 1);
    // Chips are conserved on every frame until the pot is paid out.
    const start = record.players.reduce((sum, p) => sum + p.startingStack, 0);
    for (const frame of frames.slice(0, -1)) {
      expect(frame.players.reduce((sum, p) => sum + p.stack, 0) + frame.pot).toBe(start);
    }
    const final = frames.at(-1);
    expect(final?.players.map((p) => p.stack)).toEqual(record.players.map((p) => p.endingStack));
  });

  it('tracks folds, bets and the board', () => {
    const record = makeHandRecord();
    const frames = buildTimeline(record);

    expect(frames.map((f) => f.message.key)).toEqual([
      'replay.deal',
      'replay.action.fold',
      'replay.result',
    ]);
    expect(frames[1]?.players.find((p) => p.id === record.heroId)?.folded).toBe(true);
    expect(frames[1]?.actorId).toBe(record.heroId);
    expect(frameBeforeEvent(frames, 1)).toBe(0);
  });
});

describe('hand list filters', () => {
  it('filters by position, verdict, reached street and bot level', async () => {
    const entries = (await playHands(5, 8)).map((r) => toEntry(r));
    expect(applyFilters(entries, NO_FILTERS)).toHaveLength(entries.length);

    const position = entries[0]?.summary.heroPosition ?? 'btn';
    const byPosition = applyFilters(entries, { ...NO_FILTERS, position });
    expect(byPosition.length).toBeGreaterThan(0);
    expect(byPosition.every((e) => e.summary.heroPosition === position)).toBe(true);

    const flopped = applyFilters(entries, { ...NO_FILTERS, street: 'flop' });
    expect(flopped.every((e) => e.summary.lastStreet !== 'preflop')).toBe(true);
    expect(
      applyFilters(entries, { ...NO_FILTERS, street: 'showdown' }).every(
        (e) => e.summary.lastStreet === 'showdown',
      ),
    ).toBe(true);

    const best = applyFilters(entries, { ...NO_FILTERS, verdict: 'best' });
    expect(best.every((e) => e.summary.verdicts.includes('best'))).toBe(true);
    expect(applyFilters(entries, { ...NO_FILTERS, botLevel: 'beginner' })).toEqual([]);
  });
});

describe('hand history text', () => {
  it('writes every seat with its cards, every action and the summary', () => {
    const text = formatHandText(makeHandRecord());
    expect(text).toContain("Hand #1 (hand-1) - Hold'em No Limit (5/10)");
    expect(text).toContain('Seat 1: local-player (1000 in chips) (button) [Ah Kh]');
    expect(text).toContain('Seat 2: bot-1 (1000 in chips) [Qs Qd]');
    expect(text).toContain('local-player: folds');
    expect(text).toContain('bot-1 collected 15');
    expect(text).toContain('*** SUMMARY ***');
    expect(text).toContain('local-player: -5');
  });

  it('lists several hands oldest first', () => {
    const text = formatHandsText([
      makeHandRecord({ id: 'late', handNumber: 2, endedAt: 9 }),
      makeHandRecord({ id: 'early', handNumber: 1, endedAt: 1 }),
    ]);
    expect(text.indexOf('(early)')).toBeLessThan(text.indexOf('(late)'));
  });
});

describe('cumulativeWinnings', () => {
  it('accumulates actual results and replaces all-in hands by their expected value', () => {
    const base = toEntry(makeHandRecord(), null);
    const allIn = {
      ...base,
      record: { ...base.record, id: 'b', endedAt: 5 },
      summary: { ...base.summary, heroNetBb: -10 },
      analysis: {
        schemaVersion: 1 as const,
        handId: 'b',
        analysisVersion: 4,
        computedAt: 0,
        decisions: [],
        equityByStreet: [],
        turningPoints: [],
        outcome: {
          showdown: true,
          players: [],
          pots: [],
          foldWin: null,
          allIn: { street: 'preflop' as const, heroEquity: 0.8, expectedNet: 60, actualNet: -100 },
          explanations: [],
        },
      },
    };
    // The all-in hand ended first: it counts at its expected +6 bb instead of the actual −10.
    expect(cumulativeWinnings([base, allIn])).toEqual({
      actual: [-10, -10.5],
      expected: [6, 5.5],
    });
  });
});
