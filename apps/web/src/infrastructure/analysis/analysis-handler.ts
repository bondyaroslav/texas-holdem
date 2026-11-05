import { analyzeHand } from '@poker/analysis';
import { handRecordSchema } from '@poker/protocol';
import type { AnalysisRequest, AnalysisResponse } from './analysis-messages.js';

/** Preflop with several players is sampled; this keeps one hand to a second or two on a typical laptop. */
const EQUITY_ITERATIONS = 20_000;

/**
 * The worker's whole job, kept free of `self`/`postMessage` so it can be
 * tested without a real Worker. The record is re-validated because it crossed
 * a thread boundary (and, later, may come from a server).
 */
export function handleAnalysisRequest(
  request: AnalysisRequest,
  now: () => number = Date.now,
): AnalysisResponse {
  try {
    const parsed = handRecordSchema.safeParse(request.record);
    if (!parsed.success) {
      return { id: request.id, ok: false, message: 'Hand record failed validation' };
    }
    const analysis = analyzeHand(parsed.data, {
      computedAt: now(),
      equity: { iterations: EQUITY_ITERATIONS },
    });
    return { id: request.id, ok: true, analysis };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown analysis error';
    return { id: request.id, ok: false, message };
  }
}
