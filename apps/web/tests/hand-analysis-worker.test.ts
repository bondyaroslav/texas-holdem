import { describe, expect, it } from 'vitest';
import { ANALYSIS_VERSION } from '@poker/analysis';
import { handleAnalysisRequest } from '@/infrastructure/analysis/analysis-handler';
import type {
  AnalysisRequest,
  AnalysisResponse,
} from '@/infrastructure/analysis/analysis-messages';
import {
  WorkerHandAnalyzer,
  type AnalysisWorkerLike,
} from '@/infrastructure/analysis/worker-hand-analyzer';
import { makeHandRecord } from './fixtures/hand-record';

describe('handleAnalysisRequest', () => {
  it('analyzes a valid record', () => {
    const response = handleAnalysisRequest({ id: 7, record: makeHandRecord() }, () => 123);

    expect(response.ok).toBe(true);
    if (response.ok) {
      expect(response.id).toBe(7);
      expect(response.analysis.analysisVersion).toBe(ANALYSIS_VERSION);
      expect(response.analysis.computedAt).toBe(123);
      expect(response.analysis.equityByStreet[0]?.street).toBe('preflop');
    }
  });

  it('reports a record that fails validation instead of throwing', () => {
    const broken = {
      ...makeHandRecord(),
      schemaVersion: 99,
    } as unknown as AnalysisRequest['record'];
    const response = handleAnalysisRequest({ id: 1, record: broken });

    expect(response).toEqual({ id: 1, ok: false, message: 'Hand record failed validation' });
  });

  it('reports an analysis crash as an error response', () => {
    // Two identical hole cards pass the schema but make the equity input invalid.
    const record = makeHandRecord();
    const [first] = record.players;
    const clash = {
      ...record,
      players: record.players.map((p) => ({ ...p, holeCards: first?.holeCards ?? [] })),
    };
    const response = handleAnalysisRequest({ id: 2, record: clash });

    expect(response.ok).toBe(false);
    expect(response.id).toBe(2);
  });
});

class FakeWorker implements AnalysisWorkerLike {
  onmessage: ((event: MessageEvent<AnalysisResponse>) => void) | null = null;
  onerror: ((event: ErrorEvent) => void) | null = null;
  terminated = false;
  readonly requests: AnalysisRequest[] = [];
  autoReply = true;

  postMessage(message: AnalysisRequest): void {
    this.requests.push(message);
    if (this.autoReply) {
      this.reply(handleAnalysisRequest(message));
    }
  }

  reply(response: AnalysisResponse): void {
    this.onmessage?.({ data: response } as MessageEvent<AnalysisResponse>);
  }

  terminate(): void {
    this.terminated = true;
  }
}

describe('WorkerHandAnalyzer', () => {
  it('resolves each request with its own analysis', async () => {
    const worker = new FakeWorker();
    const analyzer = new WorkerHandAnalyzer(() => worker);

    const [a, b] = await Promise.all([
      analyzer.analyze(makeHandRecord({ id: 'a' })),
      analyzer.analyze(makeHandRecord({ id: 'b' })),
    ]);

    expect([a.handId, b.handId]).toEqual(['a', 'b']);
    expect(worker.requests.map((r) => r.id)).toEqual([1, 2]);
  });

  it('starts the worker lazily and reuses it', async () => {
    let created = 0;
    const analyzer = new WorkerHandAnalyzer(() => {
      created++;
      return new FakeWorker();
    });
    expect(created).toBe(0);

    await analyzer.analyze(makeHandRecord());
    await analyzer.analyze(makeHandRecord());
    expect(created).toBe(1);
  });

  it('rejects when the worker reports an error response', async () => {
    const worker = new FakeWorker();
    worker.autoReply = false;
    const analyzer = new WorkerHandAnalyzer(() => worker);

    const pending = analyzer.analyze(makeHandRecord());
    worker.reply({ id: 1, ok: false, message: 'boom' });

    await expect(pending).rejects.toThrow('boom');
  });

  it('ignores a response nobody is waiting for', async () => {
    const worker = new FakeWorker();
    const analyzer = new WorkerHandAnalyzer(() => worker);
    await analyzer.analyze(makeHandRecord());

    expect(() => {
      worker.reply({ id: 999, ok: false, message: 'late' });
    }).not.toThrow();
  });

  it('rejects everything pending when the worker crashes, then starts a fresh one', async () => {
    const workers: FakeWorker[] = [];
    const analyzer = new WorkerHandAnalyzer(() => {
      const worker = new FakeWorker();
      worker.autoReply = workers.length > 0;
      workers.push(worker);
      return worker;
    });

    const pending = analyzer.analyze(makeHandRecord());
    workers[0]?.onerror?.({ message: 'crashed' } as ErrorEvent);
    await expect(pending).rejects.toThrow('crashed');
    expect(workers[0]?.terminated).toBe(true);

    await expect(analyzer.analyze(makeHandRecord())).resolves.toMatchObject({ handId: 'hand-1' });
    expect(workers).toHaveLength(2);
  });

  it('falls back to a default message for an anonymous crash', async () => {
    const worker = new FakeWorker();
    worker.autoReply = false;
    const analyzer = new WorkerHandAnalyzer(() => worker);

    const pending = analyzer.analyze(makeHandRecord());
    worker.onerror?.({ message: '' } as ErrorEvent);

    await expect(pending).rejects.toThrow('Analysis worker crashed');
  });

  it('rejects pending work on dispose and can be used again afterwards', async () => {
    const workers: FakeWorker[] = [];
    const analyzer = new WorkerHandAnalyzer(() => {
      const worker = new FakeWorker();
      worker.autoReply = workers.length > 0;
      workers.push(worker);
      return worker;
    });

    const pending = analyzer.analyze(makeHandRecord());
    analyzer.dispose();
    await expect(pending).rejects.toThrow('disposed');
    expect(workers[0]?.terminated).toBe(true);

    await expect(analyzer.analyze(makeHandRecord())).resolves.toBeDefined();
  });
});
