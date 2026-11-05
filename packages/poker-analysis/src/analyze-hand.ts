import type { Card, PlayerId } from '@poker/engine';
import type { HandAnalysis, HandRecord, StreetEquity } from '@poker/protocol';
import { DEFAULT_ANALYSIS_CONFIG, type AnalysisConfig } from './analysis-config.js';
import { analyzeDecisions } from './decisions/index.js';
import { computeEquity, type Combo, type EquityOptions } from '@poker/ai';
import { analyzeOutcome, findTurningPoints } from './outcome/index.js';
import { replayHand } from './replay.js';

/** Bump when the analysis output or its logic changes; stored results with another version get recomputed. */
export const ANALYSIS_VERSION = 4;

export interface AnalyzeHandOptions {
  /** Stored as-is; the package never reads the clock itself. */
  readonly computedAt: number;
  /** Settings for the per-street equity view. */
  readonly equity?: Omit<EquityOptions, 'seed'>;
  /** Overrides for decision analysis (thresholds, iterations, range narrowing). */
  readonly config?: Partial<AnalysisConfig>;
}

function toCombo(cards: readonly Card[]): Combo | null {
  const [first, second] = cards;
  return first && second ? [first, second] : null;
}

/**
 * Equity of everyone still in the hand at the start of each street, measured
 * against their real cards ("with known cards"). Cards of players who already
 * folded are treated as dead, since the record knows them.
 */
export function analyzeHand(record: HandRecord, options: AnalyzeHandOptions): HandAnalysis {
  const holeCardsById = new Map<PlayerId, Combo>();
  for (const player of record.players) {
    const combo = toCombo(player.holeCards);
    if (combo) holeCardsById.set(player.id, combo);
  }

  const folded = new Set<PlayerId>();
  const board: Card[] = [];
  const snapshots: { street: StreetEquity['street']; board: Card[]; folded: PlayerId[] }[] = [
    { street: 'preflop', board: [], folded: [] },
  ];

  for (const event of record.events) {
    if (event.type === 'actionTaken' && event.action.kind === 'fold') {
      folded.add(event.playerId);
    } else if (event.type === 'streetAdvanced') {
      board.push(...event.communityCards);
      // The step into 'showdown' deals nothing, so it has no equity snapshot of its own.
      if (event.street === 'flop' || event.street === 'turn' || event.street === 'river') {
        snapshots.push({ street: event.street, board: [...board], folded: [...folded] });
      }
    }
  }

  const equityByStreet: StreetEquity[] = [];
  snapshots.forEach((snapshot, index) => {
    const foldedNow = new Set(snapshot.folded);
    const contenders = [...holeCardsById].filter(([id]) => !foldedNow.has(id));
    // A street with one player left has nothing to contest.
    if (contenders.length < 2) return;

    const dead = [...holeCardsById]
      .filter(([id]) => foldedNow.has(id))
      .flatMap(([, combo]) => [...combo]);
    const result = computeEquity(
      {
        participants: contenders.map(([, cards]) => ({ kind: 'hand' as const, cards })),
        board: snapshot.board,
        dead,
      },
      // Distinct seeds per street keep the samples independent yet reproducible.
      { ...options.equity, seed: (record.seed + index * 7919) >>> 0 },
    );

    equityByStreet.push({
      street: snapshot.street,
      board: snapshot.board,
      method: result.method,
      samples: result.samples,
      players: contenders.map(([playerId], i) => {
        const equity = result.participants[i];
        return {
          playerId,
          win: equity?.win ?? 0,
          tie: equity?.tie ?? 0,
          equity: equity?.equity ?? 0,
        };
      }),
    });
  });

  const config = { ...DEFAULT_ANALYSIS_CONFIG, ...options.config };
  const { steps, final } = replayHand(record);
  const outcome = analyzeOutcome(record, steps, final, { iterations: config.decisionIterations });
  return {
    schemaVersion: 1,
    handId: record.id,
    analysisVersion: ANALYSIS_VERSION,
    computedAt: options.computedAt,
    decisions: analyzeDecisions(record, steps, config),
    outcome,
    turningPoints: findTurningPoints(equityByStreet, outcome, config.turningPoints),
    equityByStreet,
  };
}
