import {
  VERDICTS,
  type HandAnalysis,
  type HandRecord,
  type HeroStats,
  type Rate,
  type Verdict,
} from '@poker/protocol';
import { heroHandFacts, type HeroHandFacts } from './hand-facts.js';

export interface StatsEntry {
  readonly record: HandRecord;
  /** Missing until the worker has analysed the hand; decision and all-in figures then skip it. */
  readonly analysis?: HandAnalysis | null;
}

const rate = (count: number, of: number): Rate => ({
  count,
  of,
  value: of > 0 ? count / of : null,
});

/** Session or all-time hero statistics — pure aggregation over stored hands and their analyses. */
export function computeHeroStats(entries: readonly StatsEntry[]): HeroStats {
  const facts: HeroHandFacts[] = [];
  for (const entry of entries) {
    const f = heroHandFacts(entry.record);
    if (f) facts.push(f);
  }
  const count = (pick: (f: HeroHandFacts) => boolean): number => facts.filter(pick).length;
  const sum = (pick: (f: HeroHandFacts) => number): number =>
    facts.reduce((total, f) => total + pick(f), 0);

  const netBb = sum((f) => f.netBb);
  const aggressive = sum((f) => f.postflopAggressive);
  const calls = sum((f) => f.postflopCalls);
  const showdowns = count((f) => f.wentToShowdown);

  let allInHands = 0;
  let expectedBb = 0;
  let actualBb = 0;
  const byVerdict = Object.fromEntries(VERDICTS.map((v) => [v, 0])) as Record<Verdict, number>;
  let evLossBb = 0;
  for (const { record, analysis } of entries) {
    if (!analysis) continue;
    const allIn = analysis.outcome?.allIn;
    if (allIn) {
      allInHands++;
      expectedBb += allIn.expectedNet / record.blinds.bigBlind;
      actualBb += allIn.actualNet / record.blinds.bigBlind;
    }
    for (const decision of analysis.decisions) {
      byVerdict[decision.verdict]++;
      evLossBb += decision.evLossBb;
    }
  }
  const totalDecisions = VERDICTS.reduce((total, v) => total + byVerdict[v], 0);

  return {
    hands: facts.length,
    netChips: sum((f) => f.netChips),
    netBb,
    bbPer100: facts.length > 0 ? (netBb / facts.length) * 100 : null,
    vpip: rate(
      count((f) => f.vpip),
      facts.length,
    ),
    pfr: rate(
      count((f) => f.pfr),
      facts.length,
    ),
    aggression: { aggressive, calls, factor: calls > 0 ? aggressive / calls : null },
    wtsd: rate(
      showdowns,
      count((f) => f.sawFlop),
    ),
    wsd: rate(
      count((f) => f.wonAtShowdown),
      showdowns,
    ),
    allIn: { hands: allInHands, expectedBb, actualBb, luckBb: actualBb - expectedBb },
    decisions: {
      total: totalDecisions,
      byVerdict,
      accuracy: totalDecisions > 0 ? (byVerdict.best + byVerdict.good) / totalDecisions : null,
      evLossBb,
    },
  };
}
