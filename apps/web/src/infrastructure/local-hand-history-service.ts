import { computeHeroStats, detectLeaks } from '@poker/analysis';
import type { HandHistoryRepository, HeroStats, Leak } from '@poker/protocol';
import type { HandEntry, HandHistoryService } from '@/shared';
import { summarizeHand } from './hand-summary.js';
import type { LocalHistoryPreferences } from './local-history-preferences.js';

/**
 * `HandHistoryService` over the local repository, with stats and leaks
 * computed in place (pure, cheap aggregation — no worker needed).
 */
export class LocalHandHistoryService implements HandHistoryService {
  readonly sessionStartedAt: number;
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly repository: HandHistoryRepository,
    private readonly preferences: LocalHistoryPreferences,
    now: () => number = Date.now,
  ) {
    this.sessionStartedAt = now();
  }

  async list(): Promise<readonly HandEntry[]> {
    const records = await this.repository.listHands();
    return Promise.all(
      records.map(async (record) => {
        const analysis = await this.repository.getAnalysis(record.id);
        return { record, analysis, summary: summarizeHand(record, analysis) };
      }),
    );
  }

  async get(handId: string): Promise<HandEntry | null> {
    const record = await this.repository.getHand(handId);
    if (!record) return null;
    const analysis = await this.repository.getAnalysis(handId);
    return { record, analysis, summary: summarizeHand(record, analysis) };
  }

  stats(entries: readonly HandEntry[]): HeroStats {
    return computeHeroStats(entries);
  }

  leaks(entries: readonly HandEntry[]): readonly Leak[] {
    return detectLeaks(entries);
  }

  async clear(): Promise<void> {
    await this.repository.clear();
    this.notifyChanged();
  }

  getMaxHands(): number {
    return this.preferences.getMaxHands();
  }

  setMaxHands(maxHands: number): void {
    this.preferences.setMaxHands(maxHands);
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Wired to the recording pipeline: a hand or an analysis was just stored. */
  notifyChanged(): void {
    for (const listener of this.listeners) listener();
  }
}
