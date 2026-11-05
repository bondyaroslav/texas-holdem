import { seatPositions } from '@poker/analysis';
import type { HandAnalysis, HandRecord } from '@poker/protocol';
import type { HandLabel, HandSummary, ReachedStreet } from '@/shared';

/** Pots of at least this many big blinds are labelled big. */
const BIG_POT_BB = 50;

export function summarizeHand(record: HandRecord, analysis: HandAnalysis | null): HandSummary {
  const hero = record.players.find((p) => p.id === record.heroId);
  const bigBlind = record.blinds.bigBlind;

  let lastStreet: ReachedStreet = 'preflop';
  let awarded = 0;
  for (const event of record.events) {
    if (event.type === 'streetAdvanced')
      lastStreet = event.street === 'idle' ? lastStreet : event.street;
    if (event.type === 'potAwarded') awarded += event.amount;
  }

  const verdicts = analysis?.decisions.map((d) => d.verdict) ?? [];
  const sound = verdicts.filter((v) => v === 'best' || v === 'good').length;

  const labels: HandLabel[] = [];
  if (analysis?.outcome?.showdown ?? lastStreet === 'showdown') labels.push('showdown');
  if (analysis?.outcome?.allIn) labels.push('allIn');
  for (const point of analysis?.turningPoints ?? []) {
    if (point.playerId !== record.heroId) continue;
    if (point.kind === 'badBeat' || point.kind === 'suckOut') labels.push(point.kind);
  }
  if (awarded >= BIG_POT_BB * bigBlind) labels.push('bigPot');

  return {
    heroPosition: seatPositions(record).get(record.heroId) ?? 'btn',
    heroNetBb: hero ? (hero.endingStack - hero.startingStack) / bigBlind : 0,
    accuracy: verdicts.length > 0 ? sound / verdicts.length : null,
    verdicts,
    lastStreet,
    labels,
  };
}
