import { describe, expect, it, vi } from 'vitest';
import { ANALYSIS_VERSION } from '@poker/analysis';
import type { HandAnalysis, HandAnalyzer, HandHistoryRepository } from '@poker/protocol';
import { HandRecordingPipeline } from '@/infrastructure/hand-recording-pipeline';
import { IndexedDbHandHistoryRepository } from '@/infrastructure/indexed-db-hand-history-repository';
import { makeHandRecord } from './fixtures/hand-record';

let dbCounter = 0;
const newRepository = (): IndexedDbHandHistoryRepository =>
  new IndexedDbHandHistoryRepository({ dbName: `pipeline-db-${String(++dbCounter)}` });

function fakeAnalyzer(version = ANALYSIS_VERSION): HandAnalyzer & { calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    analyze: (record) => {
      calls.push(record.id);
      const analysis: HandAnalysis = {
        schemaVersion: 1,
        handId: record.id,
        analysisVersion: version,
        computedAt: 1,
        decisions: [],
        outcome: null,
        turningPoints: [],
        equityByStreet: [],
      };
      return Promise.resolve(analysis);
    },
    dispose: () => undefined,
  };
}

describe('HandRecordingPipeline', () => {
  it('stores the record, analyzes it and stores the analysis', async () => {
    const repository = newRepository();
    const analyzer = fakeAnalyzer();
    const pipeline = new HandRecordingPipeline(repository, analyzer);

    await pipeline.record(makeHandRecord({ id: 'a' }));

    expect(await repository.getHand('a')).not.toBeNull();
    expect((await repository.getAnalysis('a'))?.analysisVersion).toBe(ANALYSIS_VERSION);
    expect(analyzer.calls).toEqual(['a']);
  });

  it('still stores hands when there is no analyzer', async () => {
    const repository = newRepository();
    const pipeline = new HandRecordingPipeline(repository);

    await pipeline.record(makeHandRecord({ id: 'a' }));
    await pipeline.reanalyzeOutdated();

    expect(await repository.getHand('a')).not.toBeNull();
    expect(await repository.getAnalysis('a')).toBeNull();
  });

  it('swallows a storage failure and skips analysis for that hand', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repository = newRepository();
    vi.spyOn(repository, 'saveHand').mockRejectedValue(new Error('quota'));
    const analyzer = fakeAnalyzer();
    const pipeline = new HandRecordingPipeline(repository, analyzer);

    await expect(pipeline.record(makeHandRecord())).resolves.toBeUndefined();
    expect(analyzer.calls).toEqual([]);
  });

  it('swallows an analyzer failure, keeping the stored hand for a later retry', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repository = newRepository();
    const analyzer: HandAnalyzer = {
      analyze: () => Promise.reject(new Error('worker died')),
      dispose: () => undefined,
    };
    const pipeline = new HandRecordingPipeline(repository, analyzer);

    await expect(pipeline.record(makeHandRecord({ id: 'a' }))).resolves.toBeUndefined();
    expect(await repository.getHand('a')).not.toBeNull();
    expect(await repository.getAnalysis('a')).toBeNull();
  });

  it('re-analyzes only hands whose analysis is missing or from another version', async () => {
    const repository = newRepository();
    await repository.saveHand(makeHandRecord({ id: 'fresh', endedAt: 1 }));
    await repository.saveHand(makeHandRecord({ id: 'stale', endedAt: 2 }));
    await repository.saveHand(makeHandRecord({ id: 'none', endedAt: 3 }));
    await repository.saveAnalysis({
      schemaVersion: 1,
      handId: 'fresh',
      analysisVersion: ANALYSIS_VERSION,
      computedAt: 1,
      decisions: [],
      outcome: null,
      turningPoints: [],
      equityByStreet: [],
    });
    await repository.saveAnalysis({
      schemaVersion: 1,
      handId: 'stale',
      analysisVersion: ANALYSIS_VERSION - 1,
      computedAt: 1,
      decisions: [],
      outcome: null,
      turningPoints: [],
      equityByStreet: [],
    });
    const analyzer = fakeAnalyzer();

    await new HandRecordingPipeline(repository, analyzer).reanalyzeOutdated();

    expect(analyzer.calls.sort()).toEqual(['none', 'stale']);
    expect((await repository.getAnalysis('stale'))?.analysisVersion).toBe(ANALYSIS_VERSION);
  });

  it('survives a failing repository listing during re-analysis', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const repository: HandHistoryRepository = {
      ...newRepository(),
      listHandsNeedingAnalysis: () => Promise.reject(new Error('db gone')),
    } as unknown as HandHistoryRepository;
    const pipeline = new HandRecordingPipeline(repository, fakeAnalyzer());

    await expect(pipeline.reanalyzeOutdated()).resolves.toBeUndefined();
  });

  it('runs analyses one after another, in arrival order', async () => {
    const repository = newRepository();
    const order: string[] = [];
    const analyzer: HandAnalyzer = {
      analyze: async (record) => {
        order.push(`start ${record.id}`);
        await Promise.resolve();
        order.push(`end ${record.id}`);
        return {
          schemaVersion: 1,
          handId: record.id,
          analysisVersion: ANALYSIS_VERSION,
          computedAt: 1,
          decisions: [],
          outcome: null,
          turningPoints: [],
          equityByStreet: [],
        };
      },
      dispose: () => undefined,
    };
    const pipeline = new HandRecordingPipeline(repository, analyzer);

    void pipeline.record(makeHandRecord({ id: 'a' }));
    void pipeline.record(makeHandRecord({ id: 'b' }));
    await pipeline.idle();

    expect(order).toEqual(['start a', 'end a', 'start b', 'end b']);
  });

  it('disposes its analyzer', () => {
    const analyzer = fakeAnalyzer();
    const dispose = vi.spyOn(analyzer, 'dispose');
    new HandRecordingPipeline(newRepository(), analyzer).dispose();

    expect(dispose).toHaveBeenCalledOnce();
  });
});
