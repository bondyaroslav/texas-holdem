import type { PlayerId } from '@poker/engine';
import type { RangeStep } from './ranges/narrow-range.js';

/** Public tendencies of one player, smoothed towards a typical player while the sample is small. */
export interface OpponentStats {
  readonly hands: number;
  /** Share of hands with money put in voluntarily preflop. */
  readonly vpip: number;
  /** Share of hands raised preflop. */
  readonly pfr: number;
  /** Postflop aggression factor: (bets + raises) / calls. */
  readonly af: number;
  /** Share of flop continuation bets this player folded to. */
  readonly foldToCbet: number;
}

interface Counts {
  hands: number;
  vpip: number;
  pfr: number;
  aggressive: number;
  calls: number;
  cbetFaced: number;
  cbetFolded: number;
}

/** What an unknown player is assumed to be until they show otherwise, and how many observations that guess is worth. */
const PRIOR = {
  vpip: 0.3,
  pfr: 0.15,
  hands: 10,
  aggressive: 3,
  calls: 2,
  foldToCbet: 0.45,
  cbets: 5,
} as const;

export const DEFAULT_OPPONENT_STATS: OpponentStats = {
  hands: 0,
  vpip: PRIOR.vpip,
  pfr: PRIOR.pfr,
  af: PRIOR.aggressive / PRIOR.calls,
  foldToCbet: PRIOR.foldToCbet,
};

const isAggressive = (step: RangeStep): boolean =>
  step.action.kind === 'bet' || step.action.kind === 'raise';

/**
 * Tracks VPIP / PFR / AF / fold-to-c-bet from public actions only — what any
 * attentive player at the table could note down. Fed one finished hand at a time.
 */
export class OpponentModel {
  private readonly counts = new Map<PlayerId, Counts>();

  recordHand(steps: readonly RangeStep[], dealtIn: readonly PlayerId[]): void {
    for (const id of dealtIn) {
      const own = steps.filter((s) => s.playerId === id);
      const c = this.countsFor(id);
      c.hands++;
      const preflop = own.filter((s) => s.street === 'preflop');
      if (preflop.some((s) => s.action.kind === 'call' || isAggressive(s))) c.vpip++;
      if (preflop.some(isAggressive)) c.pfr++;
      for (const s of own) {
        if (s.street === 'preflop') continue;
        if (isAggressive(s)) c.aggressive++;
        else if (s.action.kind === 'call') c.calls++;
      }
    }

    // A c-bet: the last preflop raiser makes the first bet on the flop.
    const aggressor = steps
      .filter((s) => s.street === 'preflop' && isAggressive(s))
      .at(-1)?.playerId;
    const flop = steps.filter((s) => s.street === 'flop');
    const cbetIndex = flop.findIndex(isAggressive);
    const cbet = flop[cbetIndex];
    if (aggressor === undefined || cbet?.playerId !== aggressor) return;
    const responders = new Set<PlayerId>();
    for (const s of flop.slice(cbetIndex + 1)) {
      if (s.raisesBefore !== 1 || responders.has(s.playerId)) continue;
      responders.add(s.playerId);
      const c = this.countsFor(s.playerId);
      c.cbetFaced++;
      if (s.action.kind === 'fold') c.cbetFolded++;
    }
  }

  stats(id: PlayerId): OpponentStats {
    const c = this.counts.get(id);
    if (!c) return DEFAULT_OPPONENT_STATS;
    const smoothed = (hits: number, total: number, prior: number, weight: number): number =>
      (hits + prior * weight) / (total + weight);
    return {
      hands: c.hands,
      vpip: smoothed(c.vpip, c.hands, PRIOR.vpip, PRIOR.hands),
      pfr: smoothed(c.pfr, c.hands, PRIOR.pfr, PRIOR.hands),
      af: (c.aggressive + PRIOR.aggressive) / (c.calls + PRIOR.calls),
      foldToCbet: smoothed(c.cbetFolded, c.cbetFaced, PRIOR.foldToCbet, PRIOR.cbets),
    };
  }

  /** Plain-object copy, safe to post to a worker. */
  snapshot(): Record<string, OpponentStats> {
    const out: Record<string, OpponentStats> = {};
    for (const id of this.counts.keys()) out[id] = this.stats(id);
    return out;
  }

  clear(): void {
    this.counts.clear();
  }

  private countsFor(id: PlayerId): Counts {
    let c = this.counts.get(id);
    if (!c) {
      c = { hands: 0, vpip: 0, pfr: 0, aggressive: 0, calls: 0, cbetFaced: 0, cbetFolded: 0 };
      this.counts.set(id, c);
    }
    return c;
  }
}
