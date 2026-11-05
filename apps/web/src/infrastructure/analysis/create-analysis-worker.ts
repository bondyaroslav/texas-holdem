import type { AnalysisWorkerLike } from './worker-hand-analyzer.js';

/** The `new URL(…, import.meta.url)` form is what lets the bundler emit the worker as its own chunk. */
export function createAnalysisWorker(): AnalysisWorkerLike {
  return new Worker(new URL('./analysis.worker.ts', import.meta.url), { type: 'module' });
}
