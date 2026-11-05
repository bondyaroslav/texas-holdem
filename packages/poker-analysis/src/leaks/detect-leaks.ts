import type { DecisionAnalysis, Leak, LeakId } from '@poker/protocol';
import type { StatsEntry } from '../stats/compute-stats.js';
import { heroHandFacts, type HeroHandFacts } from '../stats/hand-facts.js';
import { DEFAULT_LEAK_CONFIG, type LeakConfig } from './leak-config.js';

const pct = (value: number): number => Math.round(value * 100);

/**
 * Typical leaks found in the hero's hands, each linked to the hands that
 * show it. Stat leaks (VPIP, PFR, aggression, WTSD, limps) need a minimum
 * sample; decision leaks (overfolding, calling without odds, missing value)
 * need a minimum number of costly decisions of that shape. All thresholds
 * come from {@link LeakConfig}. Sorted most severe first.
 */
export function detectLeaks(
  entries: readonly StatsEntry[],
  config: LeakConfig = DEFAULT_LEAK_CONFIG,
): readonly Leak[] {
  const facts = entries
    .map((e) => heroHandFacts(e.record))
    .filter((f): f is HeroHandFacts => f !== null)
    .sort((a, b) => b.endedAt - a.endedAt);
  const refs = (pick: (f: HeroHandFacts) => boolean): string[] =>
    facts
      .filter(pick)
      .slice(0, config.maxHandRefs)
      .map((f) => f.handId);
  const statSeverity = (ratio: number): Leak['severity'] =>
    ratio >= config.majorStatRatio ? 'major' : 'moderate';

  const leaks: Leak[] = [];
  const hands = facts.length;

  if (hands >= config.minHands) {
    const vpip = facts.filter((f) => f.vpip).length / hands;
    const pfr = facts.filter((f) => f.pfr).length / hands;
    const limps = facts.filter((f) => f.limped).length / hands;

    if (vpip > config.vpipHigh) {
      leaks.push({
        id: 'vpipTooHigh',
        severity: statSeverity(vpip / config.vpipHigh),
        explanation: {
          key: 'leak.vpipTooHigh',
          params: { vpipPct: pct(vpip), limitPct: pct(config.vpipHigh), hands },
        },
        handIds: refs((f) => f.vpip && !f.pfr),
      });
    } else if (vpip < config.vpipLow) {
      leaks.push({
        id: 'vpipTooLow',
        severity: statSeverity(config.vpipLow / Math.max(vpip, 0.01)),
        explanation: {
          key: 'leak.vpipTooLow',
          params: { vpipPct: pct(vpip), limitPct: pct(config.vpipLow), hands },
        },
        handIds: [],
      });
    }
    if (vpip - pfr > config.vpipPfrGap) {
      leaks.push({
        id: 'callsTooMuchPreflop',
        severity: statSeverity((vpip - pfr) / config.vpipPfrGap),
        explanation: {
          key: 'leak.callsTooMuchPreflop',
          params: { vpipPct: pct(vpip), pfrPct: pct(pfr), limitPct: pct(config.vpipPfrGap) },
        },
        handIds: refs((f) => f.vpip && !f.pfr),
      });
    }
    if (limps > config.limpRate) {
      leaks.push({
        id: 'openLimps',
        severity: statSeverity(limps / config.limpRate),
        explanation: {
          key: 'leak.openLimps',
          params: { limpPct: pct(limps), limitPct: pct(config.limpRate) },
        },
        handIds: refs((f) => f.limped),
      });
    }
  }

  const aggressive = facts.reduce((sum, f) => sum + f.postflopAggressive, 0);
  const calls = facts.reduce((sum, f) => sum + f.postflopCalls, 0);
  if (aggressive + calls >= config.minAggressionActions && calls > 0) {
    const factor = aggressive / calls;
    if (factor < config.aggressionLow) {
      leaks.push({
        id: 'passivePostflop',
        severity: statSeverity(config.aggressionLow / Math.max(factor, 0.01)),
        explanation: {
          key: 'leak.passivePostflop',
          params: { factor: Math.round(factor * 100) / 100, limit: config.aggressionLow },
        },
        handIds: refs((f) => f.postflopCalls > f.postflopAggressive),
      });
    }
  }

  const flops = facts.filter((f) => f.sawFlop).length;
  if (flops >= config.minFlopsSeen) {
    const wtsd = facts.filter((f) => f.wentToShowdown).length / flops;
    if (wtsd > config.wtsdHigh) {
      leaks.push({
        id: 'showdownTooOften',
        severity: statSeverity(wtsd / config.wtsdHigh),
        explanation: {
          key: 'leak.showdownTooOften',
          params: { wtsdPct: pct(wtsd), limitPct: pct(config.wtsdHigh) },
        },
        handIds: refs((f) => f.wentToShowdown && !f.wonAtShowdown),
      });
    }
  }

  const decisionLeak = (
    id: LeakId,
    matches: (d: DecisionAnalysis) => boolean,
    estimate: boolean,
  ): void => {
    const hits = entries
      .flatMap(({ record, analysis }) =>
        (analysis?.decisions ?? [])
          .filter((d) => config.costlyVerdicts.includes(d.verdict) && matches(d))
          .map((d) => ({ handId: record.id, endedAt: record.endedAt, loss: d.evLossBb })),
      )
      .sort((a, b) => b.endedAt - a.endedAt);
    if (hits.length < config.minOccurrences) return;
    const lossBb = hits.reduce((sum, h) => sum + h.loss, 0);
    let severity: Leak['severity'] = 'minor';
    if (lossBb >= config.majorLossBb) severity = 'major';
    else if (lossBb >= config.moderateLossBb) severity = 'moderate';
    // A leak resting on the bet/raise heuristic is never called major.
    if (estimate && severity === 'major') severity = 'moderate';
    leaks.push({
      id,
      severity,
      explanation: {
        key: `leak.${id}`,
        params: {
          occurrences: hits.length,
          lossBb: Math.round(lossBb * 10) / 10,
          estimate: estimate ? 1 : 0,
        },
      },
      handIds: [...new Set(hits.map((h) => h.handId))].slice(0, config.maxHandRefs),
    });
  };
  decisionLeak('overfolds', (d) => d.action.kind === 'fold' && d.bestKind === 'call', false);
  decisionLeak('callsWithoutOdds', (d) => d.action.kind === 'call' && d.bestKind === 'fold', false);
  decisionLeak(
    'missesValue',
    (d) =>
      (d.action.kind === 'check' || d.action.kind === 'call') &&
      (d.bestKind === 'bet' || d.bestKind === 'raise'),
    true,
  );

  const order: Readonly<Record<Leak['severity'], number>> = { major: 0, moderate: 1, minor: 2 };
  return leaks.sort((a, b) => order[a.severity] - order[b.severity]);
}
