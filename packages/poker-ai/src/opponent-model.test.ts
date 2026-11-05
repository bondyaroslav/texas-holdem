import { describe, expect, it } from 'vitest';
import { toChips, toPlayerId } from '@poker/engine';
import { DEFAULT_OPPONENT_STATS, OpponentModel } from './opponent-model.js';
import type { RangeStep } from './ranges/narrow-range.js';

const a = toPlayerId('a');
const b = toPlayerId('b');

function step(s: Partial<RangeStep> & Pick<RangeStep, 'playerId' | 'action'>): RangeStep {
  return {
    eventIndex: 0,
    street: 'preflop',
    board: [],
    potBefore: 15,
    toCall: 0,
    committedThisStreetBefore: 0,
    raisesBefore: 0,
    ...s,
  };
}

/** `a` raises, `b` calls, `a` c-bets the flop and `b` folds. */
const cbetHand: readonly RangeStep[] = [
  step({ playerId: a, action: { kind: 'raise', amount: toChips(25) } }),
  step({ playerId: b, action: { kind: 'call' }, raisesBefore: 1 }),
  step({ playerId: b, action: { kind: 'check' }, street: 'flop' }),
  step({ playerId: a, action: { kind: 'bet', amount: toChips(30) }, street: 'flop' }),
  step({ playerId: b, action: { kind: 'fold' }, street: 'flop', raisesBefore: 1 }),
];

describe('OpponentModel', () => {
  it('starts from a typical player', () => {
    expect(new OpponentModel().stats(a)).toEqual(DEFAULT_OPPONENT_STATS);
  });

  it('moves VPIP, PFR, AF and fold-to-c-bet towards what it observes', () => {
    const model = new OpponentModel();
    for (let i = 0; i < 40; i++) model.recordHand(cbetHand, [a, b]);
    const raiser = model.stats(a);
    const folder = model.stats(b);
    expect(raiser.hands).toBe(40);
    expect(raiser.vpip).toBeGreaterThan(0.8);
    expect(raiser.pfr).toBeGreaterThan(0.8);
    expect(raiser.af).toBeGreaterThan(10);
    expect(folder.vpip).toBeGreaterThan(0.8);
    expect(folder.pfr).toBeLessThan(0.1);
    expect(folder.foldToCbet).toBeGreaterThan(0.85);
    expect(Object.keys(model.snapshot())).toEqual([a, b]);
  });
});
