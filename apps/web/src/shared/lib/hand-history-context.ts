import { createContext, useContext } from 'react';
import type { HandAnalysis, HandRecord, HeroStats, Leak, Verdict } from '@poker/protocol';

export type SeatPosition = 'utg' | 'mp' | 'hj' | 'co' | 'btn' | 'sb' | 'bb';
export type ReachedStreet = 'preflop' | 'flop' | 'turn' | 'river' | 'showdown';
export type HandLabel = 'showdown' | 'allIn' | 'badBeat' | 'suckOut' | 'bigPot';

/** What a hand-history list shows and filters on, precomputed so the UI holds no poker logic. */
export interface HandSummary {
  readonly heroPosition: SeatPosition;
  readonly heroNetBb: number;
  /** Share of the hero's decisions rated best or good; null until analysed or when he made none. */
  readonly accuracy: number | null;
  readonly verdicts: readonly Verdict[];
  readonly lastStreet: ReachedStreet;
  readonly labels: readonly HandLabel[];
}

export interface HandEntry {
  readonly record: HandRecord;
  /** Null until the worker has analysed the hand. */
  readonly analysis: HandAnalysis | null;
  readonly summary: HandSummary;
}

/**
 * Read side of hand history and its analysis for the UI. The composition root
 * picks the implementation (IndexedDB + local analysis today, a server API
 * later); pages and features only see this interface.
 */
export interface HandHistoryService {
  /** Newest first. */
  list(): Promise<readonly HandEntry[]>;
  get(handId: string): Promise<HandEntry | null>;
  stats(entries: readonly HandEntry[]): HeroStats;
  leaks(entries: readonly HandEntry[]): readonly Leak[];
  clear(): Promise<void>;
  getMaxHands(): number;
  setMaxHands(maxHands: number): void;
  /** Hands that ended after this moment belong to the current session. */
  readonly sessionStartedAt: number;
  /** Called when a hand or analysis is stored or the history is cleared. */
  subscribe(listener: () => void): () => void;
}

export const HandHistoryContext = createContext<HandHistoryService | null>(null);

export function useHandHistoryService(): HandHistoryService {
  const service = useContext(HandHistoryContext);
  if (!service) {
    throw new Error('useHandHistoryService must be used within a HandHistoryContext.Provider');
  }
  return service;
}
