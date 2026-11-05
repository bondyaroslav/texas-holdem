import type { HandAnalysis, HandAnalyzer, HandRecord } from '@poker/protocol';
import type { AnalysisRequest, AnalysisResponse } from './analysis-messages.js';

interface Pending {
  readonly resolve: (analysis: HandAnalysis) => void;
  readonly reject: (error: Error) => void;
}

/** The slice of `Worker` this class uses — lets tests substitute a fake. */
export interface AnalysisWorkerLike {
  onmessage: ((event: MessageEvent<AnalysisResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: AnalysisRequest): void;
  terminate(): void;
}

/**
 * Runs {@link HandAnalyzer} in a Web Worker so equity sampling never blocks
 * the table. The worker starts on first use and is recreated after a crash
 * or `dispose()`.
 */
export class WorkerHandAnalyzer implements HandAnalyzer {
  private worker: AnalysisWorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<number, Pending>();

  constructor(private readonly createWorker: () => AnalysisWorkerLike) {}

  analyze(record: HandRecord): Promise<HandAnalysis> {
    const worker = this.ensureWorker();
    const id = this.nextId++;
    return new Promise<HandAnalysis>((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      worker.postMessage({ id, record });
    });
  }

  dispose(): void {
    this.shutDown(new Error('Analyzer disposed'));
  }

  private ensureWorker(): AnalysisWorkerLike {
    if (this.worker) {
      return this.worker;
    }
    const worker = this.createWorker();
    worker.onmessage = (event) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      this.pending.delete(response.id);
      if (!pending) {
        return;
      }
      if (response.ok) {
        pending.resolve(response.analysis);
      } else {
        pending.reject(new Error(response.message));
      }
    };
    worker.onerror = (event) => {
      this.shutDown(new Error(event.message || 'Analysis worker crashed'));
    };
    this.worker = worker;
    return worker;
  }

  private shutDown(reason: Error): void {
    this.worker?.terminate();
    this.worker = null;
    const rejected = [...this.pending.values()];
    this.pending.clear();
    for (const { reject } of rejected) {
      reject(reason);
    }
  }
}
