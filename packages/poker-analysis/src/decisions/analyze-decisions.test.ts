import { decisionAnalysisSchema, type DecisionAnalysis, type HandRecord } from '@poker/protocol';
import { describe, expect, it } from 'vitest';
import { DEFAULT_ANALYSIS_CONFIG, type AnalysisConfig } from '../analysis-config.js';
import { explainDecision } from '../explain/index.js';
import { bet, buildRecord, call, check, fold, post, raise, street } from '../record-builder.js';
import { replayActions } from '../replay.js';
import { analyzeDecisions } from './analyze-decisions.js';

const config: AnalysisConfig = { ...DEFAULT_ANALYSIS_CONFIG, decisionIterations: 3_000 };

function decide(record: HandRecord): readonly DecisionAnalysis[] {
  const decisions = analyzeDecisions(record, replayActions(record), config);
  for (const d of decisions) {
    expect(decisionAnalysisSchema.safeParse(d).success).toBe(true);
  }
  return decisions;
}

const ev = (d: DecisionAnalysis | undefined, kind: string): number | undefined =>
  d?.alternatives.find((a) => a.kind === kind)?.ev;

/** Heads-up, hero on the button: raise preflop, checked down to a river bet. */
function riverFacingBet(
  heroCards: string,
  flop: string,
  turn: string,
  river: string,
  betTotal: number,
  heroAction: 'fold' | 'call',
) {
  return buildRecord({
    seats: [
      { id: 'hero', cards: heroCards },
      { id: 'bot', cards: 'Qs Qd' },
    ],
    events: [
      post('hero', 5, 'smallBlind'),
      post('bot', 10, 'bigBlind'),
      raise('hero', 30),
      call('bot'),
      street('flop', flop),
      check('bot'),
      check('hero'),
      street('turn', turn),
      check('bot'),
      check('hero'),
      street('river', river),
      bet('bot', betTotal),
      heroAction === 'fold' ? fold('hero') : call('hero'),
      { type: 'handEnded' },
    ],
  });
}

describe('analyzeDecisions — call/fold cases', () => {
  it('folding the nuts to a river bet is a blunder', () => {
    // Ah Kh on 2h 7h Jc 9d 3h: the nut flush, no straight flush or full house possible.
    const decisions = decide(riverFacingBet('Ah Kh', '2h 7h Jc', '9d', '3h', 30, 'fold'));
    const river = decisions.find((d) => d.street === 'river');

    expect(river?.action.kind).toBe('fold');
    expect(river?.equity).toBe(1);
    expect(river?.toCall).toBe(30);
    expect(river?.requiredEquity).toBeCloseTo(30 / 120, 10);
    // Calling wins the whole 120-chip pot for 30 more.
    expect(ev(river, 'call')).toBeCloseTo(90, 6);
    // Raise to 120: villain folds 30% (90 / 300) → 0.3 × 90 + 0.7 × (300 − 120).
    expect(ev(river, 'raise')).toBeCloseTo(153, 6);
    expect(river?.alternatives.find((a) => a.kind === 'raise')?.estimate).toBe(true);
    expect(river?.bestKind).toBe('raise');
    // Measured against a heuristic, so the loss is halved: 153 × 0.5 / 10.
    expect(river?.evLossBb).toBeCloseTo(7.65, 6);
    expect(river?.verdict).toBe('blunder');
    expect(river?.explanation.key).toBe('decision.fold.preferRaise');
  });

  it('calling a pot-sized river bet with no showdown value is a big mistake', () => {
    const decisions = decide(riverFacingBet('4c 3d', 'As 8c 7h', '2s', 'Jd', 60, 'call'));
    const river = decisions.find((d) => d.street === 'river');

    expect(river?.requiredEquity).toBeCloseTo(60 / 180, 10);
    expect(river?.equity).toBeLessThan(0.2);
    expect(ev(river, 'call')).toBeLessThan(0);
    expect(river?.bestKind).toBe('fold');
    expect(['mistake', 'blunder']).toContain(river?.verdict);
    expect(river?.explanation.key).toBe('decision.call.preferFold');
  });

  it('calling a shove all-in with aces is best; with no chips behind there is no raise', () => {
    const record = buildRecord({
      dealerIndex: 1,
      seats: [
        { id: 'hero', cards: 'Ac Ad', stack: 100 },
        { id: 'bot', cards: '7h 2c' },
      ],
      events: [
        post('bot', 5, 'smallBlind'),
        post('hero', 10, 'bigBlind'),
        raise('bot', 100),
        call('hero'),
        { type: 'handEnded' },
      ],
    });
    const [shoveCall] = decide(record);

    expect(shoveCall?.toCall).toBe(90);
    expect(shoveCall?.requiredEquity).toBeCloseTo(0.45, 10);
    expect(shoveCall?.alternatives.map((a) => a.kind)).toEqual(['fold', 'call']);
    expect(shoveCall?.equity).toBeGreaterThan(0.8);
    expect(shoveCall?.verdict).toBe('best');
    expect(shoveCall?.evLossBb).toBe(0);
    expect(shoveCall?.knownCards?.equity).toBeGreaterThan(0.8);
    expect(shoveCall?.explanation.key).toBe('decision.call.ok');
  });

  it('offers check and bet when nothing is owed', () => {
    const decisions = decide(riverFacingBet('Ah Kh', '2h 7h Jc', '9d', '3h', 30, 'fold'));
    const flopCheck = decisions.find((d) => d.street === 'flop');

    expect(flopCheck?.action.kind).toBe('check');
    expect(flopCheck?.requiredEquity).toBeNull();
    expect(flopCheck?.alternatives.map((a) => a.kind)).toEqual(['check', 'bet']);
    expect(ev(flopCheck, 'check')).toBeGreaterThan(0);
  });

  it('values a multiway call over an all-in short stack per side pot', () => {
    const record = buildRecord({
      seats: [
        { id: 'hero', cards: 'Kc Kd' },
        { id: 'short', cards: 'As Qs', stack: 50 },
        { id: 'big', cards: 'Jh Jd' },
      ],
      events: [
        post('short', 5, 'smallBlind'),
        post('big', 10, 'bigBlind'),
        raise('hero', 30),
        raise('short', 50),
        raise('big', 150),
        call('hero'),
        { type: 'handEnded' },
      ],
    });
    const [, facingThreeBet] = decide(record);

    expect(facingThreeBet?.toCall).toBe(120);
    expect(facingThreeBet?.pot).toBe(230);
    expect(facingThreeBet?.alternatives.map((a) => a.kind)).toEqual(['fold', 'call', 'raise']);
    // Pots after the call: 150 three-way (main) + 200 hero-vs-big; the price is 120 of 350.
    expect(facingThreeBet?.requiredEquity).toBeCloseTo(120 / 350, 10);
    expect(facingThreeBet?.knownCards).not.toBeNull();
  });

  it('is deterministic and analyses only the hero’s own actions', () => {
    const record = riverFacingBet('Ah Kh', '2h 7h Jc', '9d', '3h', 30, 'fold');
    const first = decide(record);
    expect(decide(record)).toEqual(first);
    expect(first.map((d) => d.street)).toEqual(['preflop', 'flop', 'turn', 'river']);
  });
});

describe('explainDecision', () => {
  const base = { equity: 0.42, requiredEquity: 0.25, evLossBb: 3.04, estimate: false } as const;

  it('reports a sound move as ok and a poor one by what was better', () => {
    expect(explainDecision({ ...base, chosen: 'call', best: 'call', verdict: 'best' }).key).toBe(
      'decision.call.ok',
    );
    expect(explainDecision({ ...base, chosen: 'fold', best: 'call', verdict: 'mistake' })).toEqual({
      key: 'decision.fold.preferCall',
      params: { equityPct: 42, requiredPct: 25, evLossBb: 3.04, estimate: 0, best: 'call' },
    });
  });

  it('calls a good-but-not-best move close instead of justified', () => {
    expect(
      explainDecision({ ...base, chosen: 'call', best: 'fold', verdict: 'good', evLossBb: 0.2 }),
    ).toMatchObject({ key: 'decision.close', params: { best: 'fold' } });
  });

  it('treats bet and raise as one family and omits the price when nothing was owed', () => {
    expect(explainDecision({ ...base, chosen: 'bet', best: 'raise', verdict: 'mistake' }).key).toBe(
      'decision.bet.ok',
    );
    const message = explainDecision({
      ...base,
      requiredEquity: null,
      chosen: 'check',
      best: 'bet',
      verdict: 'inaccuracy',
      estimate: true,
    });
    expect(message.key).toBe('decision.check.preferRaise');
    expect(message.params).not.toHaveProperty('requiredPct');
    expect(message.params.estimate).toBe(1);
  });
});
