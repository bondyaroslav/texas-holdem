import type { Card } from '@poker/engine';

export type Combo = readonly [Card, Card];

export interface WeightedCombo {
  readonly cards: Combo;
  /** Relative likelihood within its range; defaults to 1. */
  readonly weight?: number;
}

/** Concrete two-card holdings with weights — the form equity simulation consumes. */
export type HandRange = readonly WeightedCombo[];
