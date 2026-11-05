import type { HandRecord } from '@poker/protocol';
import { replayActions } from '../replay.js';

/** What the hero did in one hand, in the terms the classic tracker stats are built from. */
export interface HeroHandFacts {
  readonly handId: string;
  readonly endedAt: number;
  readonly netChips: number;
  readonly netBb: number;
  /** Voluntarily put chips in preflop (blinds don't count). */
  readonly vpip: boolean;
  /** Bet or raised preflop. */
  readonly pfr: boolean;
  /** Called preflop while nobody had raised yet (a limp, including a small-blind complete). */
  readonly limped: boolean;
  readonly sawFlop: boolean;
  readonly wentToShowdown: boolean;
  readonly wonAtShowdown: boolean;
  /** Postflop bets and raises. */
  readonly postflopAggressive: number;
  readonly postflopCalls: number;
}

export function heroHandFacts(record: HandRecord): HeroHandFacts | null {
  const hero = record.players.find((p) => p.id === record.heroId);
  if (!hero) return null;

  const heroSteps = replayActions(record).filter((s) => s.playerId === record.heroId);
  const preflop = heroSteps.filter((s) => s.street === 'preflop');
  const postflop = heroSteps.filter((s) => s.street !== 'preflop');
  const isAggressive = (kind: string): boolean => kind === 'bet' || kind === 'raise';

  let foldedBeforeFlop = false;
  let folded = false;
  let flopDealt = false;
  let showdown = false;
  let wonChips = 0;
  for (const event of record.events) {
    if (
      event.type === 'actionTaken' &&
      event.playerId === record.heroId &&
      event.action.kind === 'fold'
    ) {
      folded = true;
      if (!flopDealt) foldedBeforeFlop = true;
    } else if (event.type === 'streetAdvanced') {
      if (event.street === 'flop') flopDealt = true;
      if (event.street === 'showdown') showdown = true;
    } else if (event.type === 'potAwarded' && event.playerId === record.heroId) {
      wonChips += event.amount;
    }
  }

  const netChips = hero.endingStack - hero.startingStack;
  const wentToShowdown = showdown && !folded;
  return {
    handId: record.id,
    endedAt: record.endedAt,
    netChips,
    netBb: netChips / record.blinds.bigBlind,
    vpip: preflop.some((s) => s.action.kind === 'call' || isAggressive(s.action.kind)),
    pfr: preflop.some((s) => isAggressive(s.action.kind)),
    limped: preflop.some((s) => s.action.kind === 'call' && s.raisesBefore === 0),
    sawFlop: flopDealt && !foldedBeforeFlop,
    wentToShowdown,
    wonAtShowdown: wentToShowdown && wonChips > 0,
    postflopAggressive: postflop.filter((s) => isAggressive(s.action.kind)).length,
    postflopCalls: postflop.filter((s) => s.action.kind === 'call').length,
  };
}
