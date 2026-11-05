import { toChips, toPlayerId, type EngineEvent } from '@poker/engine';
import type { DecisionAnalysis, HandAnalysis, HandRecord, Verdict } from '@poker/protocol';
import { describe, expect, it } from 'vitest';
import { detectLeaks } from '../leaks/detect-leaks.js';
import { DEFAULT_LEAK_CONFIG } from '../leaks/leak-config.js';
import { bet, buildRecord, call, check, fold, post, raise, street } from '../record-builder.js';
import { computeHeroStats, type StatsEntry } from './compute-stats.js';

const award = (player: string, amount: number): EngineEvent => ({
  type: 'potAwarded',
  playerId: toPlayerId(player),
  amount: toChips(amount),
});
const blinds = [post('hero', 5, 'smallBlind'), post('bot', 10, 'bigBlind')];
const hand = (id: string, heroEnd: number, events: readonly EngineEvent[]): HandRecord => ({
  ...buildRecord({
    seats: [
      { id: 'hero', cards: 'As Kd', end: heroEnd },
      { id: 'bot', cards: '7c 2h', end: 2000 - heroEnd },
    ],
    events: [...blinds, ...events, { type: 'handEnded' }],
  }),
  id,
  endedAt: Number(id.replace(/\D/g, '')) || 0,
});

/** Raise, opponent folds: +10. */
const steal = (id: string) => hand(id, 1010, [raise('hero', 30), fold('bot'), award('hero', 40)]);
/** Limp, check down, call a river bet and lose: −30. */
const limpCallLose = (id: string) =>
  hand(id, 970, [
    call('hero'),
    check('bot'),
    street('flop', 'Qd 8c 3s'),
    check('bot'),
    check('hero'),
    street('turn', '9h'),
    check('bot'),
    check('hero'),
    street('river', '4c'),
    bet('bot', 20),
    call('hero'),
    street('showdown'),
    award('bot', 60),
  ]);
/** Fold the small blind: −5. */
const foldSb = (id: string) => hand(id, 995, [fold('hero'), award('bot', 15)]);
/** Limp, raise a flop bet, bet the turn, opponent folds: +50. */
const limpThenAttack = (id: string) =>
  hand(id, 1050, [
    call('hero'),
    check('bot'),
    street('flop', 'Qd 8c 3s'),
    bet('bot', 10),
    raise('hero', 30),
    call('bot'),
    street('turn', '9h'),
    bet('hero', 40),
    fold('bot'),
    award('hero', 120),
  ]);

function decision(
  verdict: Verdict,
  kind: DecisionAnalysis['action']['kind'],
  bestKind: DecisionAnalysis['bestKind'],
  evLossBb: number,
): DecisionAnalysis {
  return {
    eventIndex: 0,
    street: 'river',
    pot: 100,
    toCall: 50,
    action: { kind },
    equity: 0.3,
    requiredEquity: 0.33,
    knownCards: null,
    alternatives: [{ kind, ev: 0, evBb: 0, estimate: false }],
    bestKind,
    evLossBb,
    verdict,
    explanation: { key: 'k', params: {} },
  };
}

function analysis(record: HandRecord, extra: Partial<HandAnalysis> = {}): HandAnalysis {
  return {
    schemaVersion: 1,
    handId: record.id,
    analysisVersion: 3,
    computedAt: 0,
    decisions: [],
    outcome: null,
    turningPoints: [],
    equityByStreet: [],
    ...extra,
  };
}

describe('computeHeroStats', () => {
  const records = [steal('h1'), limpCallLose('h2'), foldSb('h3'), limpThenAttack('h4')];

  it('computes the tracker stats from the records alone', () => {
    const stats = computeHeroStats(records.map((record) => ({ record })));

    expect(stats.hands).toBe(4);
    expect(stats.netChips).toBe(25);
    expect(stats.netBb).toBe(2.5);
    expect(stats.bbPer100).toBe(62.5);
    expect(stats.vpip).toEqual({ count: 3, of: 4, value: 0.75 });
    expect(stats.pfr).toEqual({ count: 1, of: 4, value: 0.25 });
    // Postflop: a raise and a bet in h4, one call in h2.
    expect(stats.aggression).toEqual({ aggressive: 2, calls: 1, factor: 2 });
    expect(stats.wtsd).toEqual({ count: 1, of: 2, value: 0.5 });
    expect(stats.wsd).toEqual({ count: 0, of: 1, value: 0 });
    expect(stats.decisions.total).toBe(0);
    expect(stats.decisions.accuracy).toBeNull();
    expect(stats.allIn.hands).toBe(0);
  });

  it('adds decision accuracy and all-in luck from analyses', () => {
    const [h1, h2] = records;
    if (!h1 || !h2) throw new Error('fixture');
    const entries: StatsEntry[] = [
      {
        record: h1,
        analysis: analysis(h1, {
          decisions: [decision('best', 'raise', 'raise', 0), decision('good', 'call', 'call', 0.2)],
        }),
      },
      {
        record: h2,
        analysis: analysis(h2, {
          decisions: [decision('blunder', 'call', 'fold', 6)],
          outcome: {
            showdown: true,
            players: [],
            pots: [],
            foldWin: null,
            allIn: { street: 'preflop', heroEquity: 0.8, expectedNet: 60, actualNet: -100 },
            explanations: [],
          },
        }),
      },
    ];
    const stats = computeHeroStats(entries);

    expect(stats.decisions.total).toBe(3);
    expect(stats.decisions.byVerdict).toEqual({
      best: 1,
      good: 1,
      inaccuracy: 0,
      mistake: 0,
      blunder: 1,
    });
    expect(stats.decisions.accuracy).toBeCloseTo(2 / 3, 10);
    expect(stats.decisions.evLossBb).toBeCloseTo(6.2, 10);
    expect(stats.allIn).toEqual({ hands: 1, expectedBb: 6, actualBb: -10, luckBb: -16 });
  });

  it('returns empty rates for no hands', () => {
    const stats = computeHeroStats([]);
    expect(stats.bbPer100).toBeNull();
    expect(stats.vpip.value).toBeNull();
    expect(stats.aggression.factor).toBeNull();
  });
});

describe('detectLeaks', () => {
  const many = (make: (id: string) => HandRecord, count: number, offset = 0) =>
    Array.from({ length: count }, (_, i) => ({ record: make(`h${String(i + offset)}`) }));

  it('finds the leaks of a calling station, worst first, linked to recent hands', () => {
    const leaks = detectLeaks(many(limpCallLose, 40));
    const ids = leaks.map((l) => l.id);

    expect(ids).toEqual(
      expect.arrayContaining([
        'vpipTooHigh',
        'callsTooMuchPreflop',
        'openLimps',
        'passivePostflop',
        'showdownTooOften',
      ]),
    );
    expect(leaks.every((l) => l.severity === 'major')).toBe(true);
    const vpip = leaks.find((l) => l.id === 'vpipTooHigh');
    expect(vpip?.explanation).toEqual({
      key: 'leak.vpipTooHigh',
      params: { vpipPct: 100, limitPct: 45, hands: 40 },
    });
    expect(vpip?.handIds).toHaveLength(DEFAULT_LEAK_CONFIG.maxHandRefs);
    expect(vpip?.handIds[0]).toBe('h39'); // newest first
  });

  it('reports nothing for a sample that is too small or a balanced player', () => {
    expect(detectLeaks(many(limpCallLose, 10))).toEqual([]);
    const balanced = [...many(steal, 12), ...many(foldSb, 20, 100)];
    expect(detectLeaks(balanced).map((l) => l.id)).toEqual([]);
  });

  it('flags a too-tight player', () => {
    expect(detectLeaks(many(foldSb, 40)).map((l) => l.id)).toEqual(['vpipTooLow']);
  });

  it('finds repeated costly decisions and caps estimate-based leaks below major', () => {
    const record = (i: number): HandRecord => foldSb(`d${String(i)}`);
    const entries: StatsEntry[] = Array.from({ length: 4 }, (_, i) => {
      const r = record(i);
      return {
        record: r,
        analysis: analysis(r, {
          decisions: [
            decision('blunder', 'fold', 'call', 6),
            decision('blunder', 'check', 'bet', 12),
            decision('inaccuracy', 'call', 'fold', 1),
          ],
        }),
      };
    });
    const leaks = detectLeaks(entries);

    expect(leaks.map((l) => [l.id, l.severity])).toEqual([
      ['overfolds', 'moderate'],
      ['missesValue', 'moderate'],
    ]);
    expect(leaks[0]?.explanation.params).toEqual({ occurrences: 4, lossBb: 24, estimate: 0 });
    expect(leaks[1]?.explanation.params).toMatchObject({ occurrences: 4, lossBb: 48, estimate: 1 });
    expect(leaks[0]?.handIds).toEqual(['d3', 'd2', 'd1', 'd0']);
  });
});
