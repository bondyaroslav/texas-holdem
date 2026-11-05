import { ANALYSIS_VERSION } from '@poker/analysis';
import type { HandAnalyzer, HandHistoryRepository, HandRecord } from '@poker/protocol';
import { logger } from '@/shared';

/**
 * After a hand ends: store its record, then analyze it off-thread and store
 * the result. Nothing here may disturb the game, so every failure is logged
 * and swallowed — a hand without analysis is simply analyzed later.
 */
export class HandRecordingPipeline {
  /** Analyses run one at a time, in arrival order. */
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly repository: HandHistoryRepository,
    /** Absent where no Worker exists (tests, old browsers): hands are stored, just not analyzed. */
    private readonly analyzer?: HandAnalyzer,
    /** Told whenever a hand or an analysis has been stored, so open views can refresh. */
    private readonly onChange?: () => void,
  ) {}

  /** Resolves when this hand's record is stored and its analysis (if any) finished. */
  record(record: HandRecord): Promise<void> {
    return this.enqueue(async () => {
      try {
        await this.repository.saveHand(record);
        this.onChange?.();
      } catch (error) {
        logger.warn('Failed to store hand record', { handId: record.id, error });
        return;
      }
      await this.analyze(record);
    });
  }

  /** Re-analyzes stored hands whose analysis is missing or from an older `analysisVersion`. */
  reanalyzeOutdated(): Promise<void> {
    return this.enqueue(async () => {
      if (!this.analyzer) {
        return;
      }
      let outdated: readonly HandRecord[];
      try {
        outdated = await this.repository.listHandsNeedingAnalysis(ANALYSIS_VERSION);
      } catch (error) {
        logger.warn('Failed to list hands needing analysis', { error });
        return;
      }
      for (const record of outdated) {
        await this.analyze(record);
      }
    });
  }

  /** Resolves when everything queued so far has settled. */
  idle(): Promise<void> {
    return this.queue;
  }

  dispose(): void {
    this.analyzer?.dispose();
  }

  private async analyze(record: HandRecord): Promise<void> {
    if (!this.analyzer) {
      return;
    }
    try {
      const analysis = await this.analyzer.analyze(record);
      await this.repository.saveAnalysis(analysis);
      this.onChange?.();
    } catch (error) {
      logger.warn('Hand analysis failed', { handId: record.id, error });
    }
  }

  private enqueue(task: () => Promise<void>): Promise<void> {
    const next = this.queue.then(task);
    this.queue = next;
    return next;
  }
}
