import { analyzeHand, computeHeroStats, detectLeaks } from '@poker/analysis';
import { createMulberry32 } from '@poker/engine';
import type {
  ActionInput,
  HandAnalysis,
  HandRecord,
  ProjectedState,
  TableConfig,
} from '@poker/protocol';
import { summarizeHand } from '@/infrastructure/hand-summary';
import { LocalGameGateway } from '@/infrastructure/local-game-gateway';
import type { HandEntry, HandHistoryService } from '@/shared';

const CONFIG: TableConfig = {
  schemaVersion: 1,
  botCount: 2,
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  isTournament: false,
  botDifficulty: 'easy',
};

/** The hero never folds: calls any bet, checks otherwise — plenty of showdowns to review. */
const callingStation = (snapshot: ProjectedState): ActionInput => {
  const me = snapshot.players.find((p) => p.id === snapshot.viewerId);
  return snapshot.currentBet > (me?.committedThisStreet ?? 0)
    ? { kind: 'call' }
    : { kind: 'check' };
};

/** Plays real hands through the LocalGameGateway (engine + bots) and returns their records. */
export async function playHands(seed: number, hands: number, botCount = 2): Promise<HandRecord[]> {
  const records: HandRecord[] = [];
  let clock = 1_700_000_000_000;
  const gateway = new LocalGameGateway({
    rng: createMulberry32(seed),
    clock: () => (clock += 1_000),
    onHandRecorded: (record) => records.push(record),
  });
  let snapshot: ProjectedState | null = null;
  gateway.subscribe((event) => {
    if (event.type === 'stateChanged') snapshot = event.snapshot;
  });
  const session = await gateway.connect({ ...CONFIG, botCount });
  for (let i = 0; i < hands; i++) {
    if (!(await gateway.send({ type: 'startHand' })).ok) break;
    for (let guard = 0; guard < 50; guard++) {
      const current = snapshot as ProjectedState | null;
      if (!current || current.street === 'idle' || current.actingPlayerId !== session.localPlayerId)
        break;
      await gateway.send({
        type: 'playerAction',
        playerId: session.localPlayerId,
        action: callingStation(current),
      });
    }
  }
  return records;
}

export function analyse(record: HandRecord): HandAnalysis {
  return analyzeHand(record, {
    computedAt: record.endedAt,
    equity: { iterations: 600 },
    config: { decisionIterations: 600 },
  });
}

export function toEntry(
  record: HandRecord,
  analysis: HandAnalysis | null = analyse(record),
): HandEntry {
  return { record, analysis, summary: summarizeHand(record, analysis) };
}

/** A hand that went to showdown and in which the hero made decisions — the richest thing to review. */
export async function reviewableEntry(): Promise<HandEntry> {
  for (let seed = 1; seed < 40; seed++) {
    for (const record of await playHands(seed, 3)) {
      const entry = toEntry(record);
      if (entry.analysis?.outcome?.showdown && entry.analysis.decisions.length >= 2) return entry;
    }
  }
  throw new Error('No reviewable hand found');
}

/** In-memory `HandHistoryService` for page tests. */
export class InMemoryHistoryService implements HandHistoryService {
  readonly sessionStartedAt: number;
  cleared = 0;
  private maxHands = 1000;
  private readonly listeners = new Set<() => void>();

  constructor(
    private entries: HandEntry[],
    sessionStartedAt = 0,
  ) {
    this.sessionStartedAt = sessionStartedAt;
  }

  list(): Promise<readonly HandEntry[]> {
    return Promise.resolve([...this.entries].sort((a, b) => b.record.endedAt - a.record.endedAt));
  }
  get(handId: string): Promise<HandEntry | null> {
    return Promise.resolve(this.entries.find((e) => e.record.id === handId) ?? null);
  }
  stats(entries: readonly HandEntry[]) {
    return computeHeroStats(entries);
  }
  leaks(entries: readonly HandEntry[]) {
    return detectLeaks(entries);
  }
  clear(): Promise<void> {
    this.cleared++;
    this.entries = [];
    for (const l of this.listeners) l();
    return Promise.resolve();
  }
  getMaxHands(): number {
    return this.maxHands;
  }
  setMaxHands(maxHands: number): void {
    this.maxHands = maxHands;
  }
  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }
}
