import type { Card, PlayerId } from '@poker/engine';
import {
  computeEquity,
  createEquityCache,
  keepTopFraction,
  narrowRange,
  type Combo,
  type HandRange,
} from '@poker/ai';
import type {
  DecisionAlternative,
  DecisionAnalysis,
  DecisionKind,
  HandRecord,
} from '@poker/protocol';
import type { AnalysisConfig } from '../analysis-config.js';
import { explainDecision } from '../explain/index.js';
import { seatPositions, type ActionStep } from '../replay.js';
import { callEv, foldProbability, raiseEv, requiredEquity, verdictFor } from './ev.js';
import { buildHeroPots } from './hero-pots.js';

const EPSILON = 1e-9;

function seedFor(base: number, step: ActionStep, tag: string): number {
  let hash = (base + step.eventIndex * 131) >>> 0;
  for (const char of tag) {
    hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function toCombo(cards: readonly Card[]): Combo | null {
  const [a, b] = cards;
  return a && b ? [a, b] : null;
}

/**
 * Judges each of the hero's actions against the opponents' *estimated* ranges
 * — what the hero could have known — not their real cards. Call, check and
 * fold are valued exactly (per side pot, showdown only); bet and raise use a
 * fold-equity heuristic and are flagged `estimate`. A view against the real
 * cards is attached as a secondary figure.
 */
export function analyzeDecisions(
  record: HandRecord,
  steps: readonly ActionStep[],
  config: AnalysisConfig,
): readonly DecisionAnalysis[] {
  const hero = record.players.find((p) => p.id === record.heroId);
  const heroCombo = hero ? toCombo(hero.holeCards) : null;
  if (!hero || !heroCombo) return [];

  const positions = seatPositions(record);
  const cache = createEquityCache(2_000);
  const bigBlind = record.blinds.bigBlind;
  const holeById = new Map<PlayerId, Combo>();
  for (const p of record.players) {
    const combo = toCombo(p.holeCards);
    if (combo) holeById.set(p.id, combo);
  }

  const decisions: DecisionAnalysis[] = [];
  for (const step of steps) {
    if (step.playerId !== record.heroId) continue;
    const opponents = record.players
      .map((p) => p.id)
      .filter((id) => id !== record.heroId && !step.folded.has(id));
    if (opponents.length === 0) continue;

    const rangeCache = new Map<PlayerId, HandRange>();
    const rangeOf = (id: PlayerId): HandRange => {
      let range = rangeCache.get(id);
      if (!range) {
        range = narrowRange({
          steps,
          villainId: id,
          untilEventIndex: step.eventIndex,
          blocked: [...heroCombo, ...step.board],
          position: positions.get(id) ?? 'mp',
          playerCount: record.players.length,
          bigBlind,
          preflop: config.preflopNarrowing,
          postflop: config.postflopNarrowing,
        });
        rangeCache.set(id, range);
      }
      return range;
    };

    const equityAgainst = (ranges: readonly HandRange[], tag: string): number => {
      if (ranges.length === 0) return 1;
      const result = computeEquity(
        {
          participants: [
            { kind: 'hand', cards: heroCombo },
            ...ranges.map((combos) => ({ kind: 'range' as const, combos })),
          ],
          board: step.board,
        },
        {
          mode: 'monteCarlo',
          iterations: config.decisionIterations,
          seed: seedFor(record.seed, step, tag),
          cache,
        },
      );
      return result.participants[0]?.equity ?? 0;
    };

    const action = step.action;
    const callChips = step.toCall;
    const pots = buildHeroPots(step, record.heroId, callChips);
    const shares = pots.map((pot) => ({
      amount: pot.amount,
      equity: equityAgainst(pot.opponents.map(rangeOf), pot.opponents.join('|')),
    }));
    const passiveEv = callEv(shares, callChips);
    const contestable = pots.reduce((sum, pot) => sum + pot.amount, 0);
    const required = requiredEquity(callChips, contestable);
    const equity = shares[0]?.equity ?? 1;
    const facing = callChips > 0;

    const alternatives: DecisionAlternative[] = [];
    if (facing) {
      alternatives.push({ kind: 'fold', ev: 0, evBb: 0, estimate: false });
    }
    alternatives.push({
      kind: facing ? 'call' : 'check',
      ev: passiveEv,
      evBb: passiveEv / bigBlind,
      estimate: false,
    });

    const responders = opponents.filter((id) => !step.allIn.has(id));
    if (step.stackBefore > callChips && responders.length > 0) {
      const raise = estimateRaise({
        record,
        step,
        config,
        opponents,
        responders,
        rangeOf,
        equityAgainst,
      });
      if (raise) alternatives.push(raise);
    }

    const chosenKind: DecisionKind = action.kind === 'allIn' ? 'call' : action.kind;
    const chosen = alternatives.find((alt) => alt.kind === chosenKind);
    if (!chosen) continue; // e.g. a raise too small to model — nothing sound to compare against

    const best = alternatives.reduce((top, alt) => (alt.ev > top.ev + EPSILON ? alt : top));
    const chosenIsBest = chosen.ev >= best.ev - EPSILON;
    let loss = Math.max(0, best.ev - chosen.ev);
    if (best.estimate && !chosen.estimate) loss *= config.estimateConfidence;
    const lossBb = loss / bigBlind;
    const verdict = verdictFor(lossBb, chosenIsBest, config.verdictThresholdsBb);

    decisions.push({
      eventIndex: step.eventIndex,
      street: step.street,
      pot: step.potBefore,
      toCall: callChips,
      action:
        action.kind === 'bet' || action.kind === 'raise'
          ? { kind: action.kind, amount: action.amount }
          : { kind: chosenKind },
      equity,
      requiredEquity: required,
      knownCards: knownCardsView({
        record,
        step,
        heroCombo,
        holeById,
        pots,
        callChips,
        iterations: config.decisionIterations,
      }),
      alternatives: alternatives.map(roundAlternative),
      bestKind: best.kind,
      evLossBb: lossBb,
      verdict,
      explanation: explainDecision({
        chosen: chosenKind,
        best: best.kind,
        verdict,
        equity,
        requiredEquity: required,
        evLossBb: lossBb,
        estimate: best.estimate || chosen.estimate,
      }),
    });
  }
  return decisions;
}

function roundAlternative(alt: DecisionAlternative): DecisionAlternative {
  return { ...alt, ev: Math.round(alt.ev * 100) / 100, evBb: Math.round(alt.evBb * 1000) / 1000 };
}

interface RaiseInput {
  readonly record: HandRecord;
  readonly step: ActionStep;
  readonly config: AnalysisConfig;
  readonly opponents: readonly PlayerId[];
  readonly responders: readonly PlayerId[];
  readonly rangeOf: (id: PlayerId) => HandRange;
  readonly equityAgainst: (ranges: readonly HandRange[], tag: string) => number;
}

/** Heuristic value of betting/raising: the size the hero chose, or a standard one when he did not. */
function estimateRaise(input: RaiseInput): DecisionAlternative | null {
  const { record, step, config, opponents, responders, rangeOf, equityAgainst } = input;
  const bigBlind = record.blinds.bigBlind;
  const action = step.action;

  let putIn: number;
  let kind: 'bet' | 'raise';
  if (action.kind === 'bet' || action.kind === 'raise') {
    kind = action.kind;
    putIn = action.amount - step.committedThisStreetBefore;
  } else if (step.currentBet === 0) {
    kind = 'bet';
    putIn = Math.max(bigBlind, Math.round(config.raiseSizeFraction * step.potBefore));
  } else {
    kind = 'raise';
    const increase = Math.max(
      step.minRaise,
      Math.round(config.raiseSizeFraction * (step.potBefore + step.toCall)),
    );
    putIn = step.currentBet + increase - step.committedThisStreetBefore;
  }
  putIn = Math.min(putIn, step.stackBefore);
  const extra = putIn - step.toCall;
  if (extra <= 0) return null;

  const potAfter = step.potBefore + putIn;
  const folds = responders.map((id) =>
    foldProbability(
      potAfter,
      Math.min(extra, step.stacks.get(id) ?? extra),
      config.foldEquityScale,
    ),
  );
  const everyoneFolds = folds.reduce((product, f) => product * f, 1);
  const expectedCallers = folds.reduce((sum, f) => sum + (1 - f), 0);
  const callers = Math.min(responders.length, Math.max(1, Math.round(expectedCallers)));

  // The likeliest callers (lowest fold chance) stand in for whoever continues; players already all-in always contest.
  const order = responders
    .map((id, i) => ({ id, fold: folds[i] ?? 0 }))
    .sort((a, b) => a.fold - b.fold)
    .slice(0, callers);
  const continuing = order.map(({ id, fold }) =>
    keepTopFraction(rangeOf(id), step.board, 1 - fold),
  );
  const allInRanges = opponents.filter((id) => step.allIn.has(id)).map(rangeOf);
  const equityWhenCalled = equityAgainst(
    [...continuing, ...allInRanges],
    `raise|${order.map((o) => o.id).join('|')}`,
  );

  const ev = raiseEv({
    pot: step.potBefore,
    putIn,
    extra,
    everyoneFolds,
    equityWhenCalled,
    callers,
  });
  return {
    kind,
    amount: step.committedThisStreetBefore + putIn,
    ev,
    evBb: ev / bigBlind,
    estimate: true,
  };
}

interface KnownInput {
  readonly record: HandRecord;
  readonly step: ActionStep;
  readonly heroCombo: Combo;
  readonly holeById: ReadonlyMap<PlayerId, Combo>;
  readonly pots: ReturnType<typeof buildHeroPots>;
  readonly callChips: number;
  readonly iterations: number;
}

/** Secondary view: the same call/check value, but against the opponents' real cards. */
function knownCardsView(input: KnownInput): DecisionAnalysis['knownCards'] {
  const { record, step, heroCombo, holeById, pots, callChips, iterations } = input;
  const dead = [...step.folded].flatMap((id) => [...(holeById.get(id) ?? [])]);
  const shares: { amount: number; equity: number }[] = [];
  for (const pot of pots) {
    const hands = pot.opponents.map((id) => holeById.get(id));
    if (hands.some((h) => h === undefined)) return null;
    if (hands.length === 0) {
      shares.push({ amount: pot.amount, equity: 1 });
      continue;
    }
    const result = computeEquity(
      {
        participants: [
          { kind: 'hand', cards: heroCombo },
          ...hands.flatMap((cards) => (cards ? [{ kind: 'hand' as const, cards }] : [])),
        ],
        board: step.board,
        dead,
      },
      { iterations, seed: (record.seed + step.eventIndex) >>> 0 },
    );
    shares.push({ amount: pot.amount, equity: result.participants[0]?.equity ?? 0 });
  }
  const main = shares[0];
  return main ? { equity: main.equity, callEv: callEv(shares, callChips) } : null;
}
