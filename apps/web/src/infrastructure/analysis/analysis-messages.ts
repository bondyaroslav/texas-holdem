import type { HandAnalysis, HandRecord } from '@poker/protocol';

/** Wire format between the main thread and the analysis worker. */
export interface AnalysisRequest {
  readonly id: number;
  readonly record: HandRecord;
}

export type AnalysisResponse =
  | { readonly id: number; readonly ok: true; readonly analysis: HandAnalysis }
  | { readonly id: number; readonly ok: false; readonly message: string };
