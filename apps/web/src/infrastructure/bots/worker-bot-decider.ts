import type { ActionInput } from '@poker/engine';
import { decideBotAction, type BotDecisionRequest } from '@poker/ai';
import { logger } from '@/shared';
import type { BotWorkerRequest, BotWorkerResponse } from './bot-messages.js';

/** The slice of `Worker` this class uses — lets tests substitute a fake. */
export interface BotWorkerLike {
  onmessage: ((event: MessageEvent<BotWorkerResponse>) => void) | null;
  onerror: ((event: ErrorEvent) => void) | null;
  postMessage(message: BotWorkerRequest): void;
  terminate(): void;
}

/** The `new URL(…, import.meta.url)` form is what lets the bundler emit the worker as its own chunk. */
export function createBotWorker(): BotWorkerLike {
  return new Worker(new URL('./bot.worker.ts', import.meta.url), { type: 'module' });
}

/**
 * Bot decisions in a Web Worker, so Hard/Expert Monte Carlo never blocks the
 * UI. If the worker fails the same decision is made in-process — a slower
 * frame beats a table stuck waiting for a bot.
 */
export class WorkerBotDecider {
  private worker: BotWorkerLike | null = null;
  private nextId = 1;
  private readonly pending = new Map<
    number,
    { readonly request: BotDecisionRequest; readonly resolve: (action: ActionInput) => void }
  >();

  constructor(private readonly createWorker: () => BotWorkerLike = createBotWorker) {}

  readonly decide = (request: BotDecisionRequest): Promise<ActionInput> =>
    new Promise((resolve) => {
      let worker: BotWorkerLike;
      try {
        worker = this.ensureWorker();
      } catch (error) {
        logger.warn('Bot worker unavailable — deciding on the main thread', { error });
        resolve(decideBotAction(request));
        return;
      }
      const id = this.nextId++;
      this.pending.set(id, { request, resolve });
      worker.postMessage({ id, request });
    });

  dispose(): void {
    this.fallBack(null);
  }

  private ensureWorker(): BotWorkerLike {
    if (this.worker) return this.worker;
    const worker = this.createWorker();
    worker.onmessage = (event) => {
      const response = event.data;
      const pending = this.pending.get(response.id);
      this.pending.delete(response.id);
      if (!pending) return;
      if (response.ok) {
        pending.resolve(response.action);
      } else {
        logger.warn('Bot worker failed a decision — retrying on the main thread', {
          message: response.message,
        });
        pending.resolve(decideBotAction(pending.request));
      }
    };
    worker.onerror = (event) => {
      this.fallBack(new Error(event.message || 'Bot worker crashed'));
    };
    this.worker = worker;
    return worker;
  }

  /** Drops the worker; decisions still waiting on it are made in-process. */
  private fallBack(reason: Error | null): void {
    if (reason)
      logger.warn('Bot worker crashed — finishing pending decisions in-process', { reason });
    this.worker?.terminate();
    this.worker = null;
    const waiting = [...this.pending.values()];
    this.pending.clear();
    for (const { request, resolve } of waiting) resolve(decideBotAction(request));
  }
}
