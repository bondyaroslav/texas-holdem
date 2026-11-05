import type { HandAnalysis } from './hand-analysis.js';
import type { HandRecord } from './hand-record.js';

/**
 * Storage boundary for finished hands and their analyses. IndexedDB today,
 * server-backed later. Reads never throw on corrupt data — invalid entries are
 * skipped so one bad row can't hide the rest of the history.
 */
export interface HandHistoryRepository {
  /** Stores the record and evicts the oldest hands (with their analyses) beyond the configured limit. */
  saveHand(record: HandRecord): Promise<void>;
  getHand(id: string): Promise<HandRecord | null>;
  /** Newest first. */
  listHands(options?: { readonly limit?: number }): Promise<readonly HandRecord[]>;
  deleteHand(id: string): Promise<void>;
  clear(): Promise<void>;
  saveAnalysis(analysis: HandAnalysis): Promise<void>;
  getAnalysis(handId: string): Promise<HandAnalysis | null>;
  /** Hands with no analysis, or one computed under a different `analysisVersion`. */
  listHandsNeedingAnalysis(analysisVersion: number): Promise<readonly HandRecord[]>;
}

/** Computes a hand's analysis off the main thread (Web Worker) or inline in tests. */
export interface HandAnalyzer {
  analyze(record: HandRecord): Promise<HandAnalysis>;
  dispose(): void;
}
