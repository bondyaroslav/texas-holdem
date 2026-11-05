import type { DecisionKind, ExplanationMessage, Verdict } from '@poker/protocol';

const KIND_SUFFIX: Readonly<Record<DecisionKind, string>> = {
  fold: 'Fold',
  check: 'Check',
  call: 'Call',
  bet: 'Raise',
  raise: 'Raise',
};

export interface ExplainDecisionInput {
  readonly chosen: DecisionKind;
  readonly best: DecisionKind;
  readonly verdict: Verdict;
  readonly equity: number;
  readonly requiredEquity: number | null;
  readonly evLossBb: number;
  /** The verdict compares against a heuristic alternative. */
  readonly estimate: boolean;
}

/**
 * Names what happened as an i18n key plus parameters — the UI owns the words.
 * `decision.<chosen>.ok` when the move was the best one (or in the best
 * family, e.g. bet vs raise), `decision.close` when another option was only
 * marginally better (verdict good), otherwise `decision.<chosen>.prefer<Best>`,
 * e.g. `decision.fold.preferCall`.
 */
export function explainDecision(input: ExplainDecisionInput): ExplanationMessage {
  const sameFamily = KIND_SUFFIX[input.chosen] === KIND_SUFFIX[input.best];
  let key = `decision.${input.chosen}.prefer${KIND_SUFFIX[input.best]}`;
  if (input.verdict === 'best' || sameFamily) key = `decision.${input.chosen}.ok`;
  // "Good" but not best: saying the move was justified would contradict the numbers next to it.
  else if (input.verdict === 'good') key = 'decision.close';

  const params: Record<string, string | number> = {
    equityPct: Math.round(input.equity * 100),
    // Two decimals: a "good" verdict can lose well under 0.1 bb, which would otherwise read as 0.
    evLossBb: Math.round(input.evLossBb * 100) / 100,
    estimate: input.estimate ? 1 : 0,
    best: input.best,
  };
  if (input.requiredEquity !== null) {
    params.requiredPct = Math.round(input.requiredEquity * 100);
  }
  return { key, params };
}
