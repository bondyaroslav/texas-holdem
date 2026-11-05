import { beforeEach, describe, expect, it } from 'vitest';
import type { HandAnalysis } from '@poker/protocol';
import { IndexedDbHandHistoryRepository } from '@/infrastructure/indexed-db-hand-history-repository';
import { makeHandRecord } from './fixtures/hand-record';

const LEGACY_KEY = 'texas-holdem:hand-history';
let dbCounter = 0;

function newRepository(maxHands?: number): IndexedDbHandHistoryRepository {
  // A fresh database per test keeps them independent.
  return new IndexedDbHandHistoryRepository({
    dbName: `test-db-${String(++dbCounter)}`,
    ...(maxHands !== undefined ? { maxHands } : {}),
  });
}

function analysisFor(handId: string, analysisVersion = 1): HandAnalysis {
  return {
    schemaVersion: 1,
    handId,
    analysisVersion,
    computedAt: 1,
    decisions: [],
    outcome: null,
    turningPoints: [],
    equityByStreet: [],
  };
}

beforeEach(() => {
  localStorage.clear();
});

describe('IndexedDbHandHistoryRepository', () => {
  it('stores and returns a hand, and null for an unknown id', async () => {
    const repo = newRepository();
    const record = makeHandRecord({ id: 'a' });
    await repo.saveHand(record);

    expect(await repo.getHand('a')).toEqual(record);
    expect(await repo.getHand('missing')).toBeNull();
  });

  it('lists newest first and honours a limit', async () => {
    const repo = newRepository();
    await repo.saveHand(makeHandRecord({ id: 'old', endedAt: 1 }));
    await repo.saveHand(makeHandRecord({ id: 'new', endedAt: 3 }));
    await repo.saveHand(makeHandRecord({ id: 'mid', endedAt: 2 }));

    expect((await repo.listHands()).map((r) => r.id)).toEqual(['new', 'mid', 'old']);
    expect((await repo.listHands({ limit: 2 })).map((r) => r.id)).toEqual(['new', 'mid']);
  });

  it('overwrites a hand saved twice under the same id', async () => {
    const repo = newRepository();
    await repo.saveHand(makeHandRecord({ id: 'a', endedAt: 1 }));
    await repo.saveHand(makeHandRecord({ id: 'a', endedAt: 5 }));

    expect(await repo.listHands()).toHaveLength(1);
    expect((await repo.getHand('a'))?.endedAt).toBe(5);
  });

  it('evicts the oldest hands, and their analyses, beyond the limit', async () => {
    const repo = newRepository(2);
    await repo.saveHand(makeHandRecord({ id: 'a', endedAt: 1 }));
    await repo.saveAnalysis(analysisFor('a'));
    await repo.saveHand(makeHandRecord({ id: 'b', endedAt: 2 }));
    await repo.saveHand(makeHandRecord({ id: 'c', endedAt: 3 }));

    expect((await repo.listHands()).map((r) => r.id)).toEqual(['c', 'b']);
    expect(await repo.getAnalysis('a')).toBeNull();
  });

  it('stores analyses per hand and ignores one for a hand that no longer exists', async () => {
    const repo = newRepository();
    await repo.saveHand(makeHandRecord({ id: 'a' }));
    await repo.saveAnalysis(analysisFor('a'));
    await repo.saveAnalysis(analysisFor('ghost'));

    expect(await repo.getAnalysis('a')).toEqual(analysisFor('a'));
    expect(await repo.getAnalysis('ghost')).toBeNull();
  });

  it('lists hands whose analysis is missing or from another version', async () => {
    const repo = newRepository();
    await repo.saveHand(makeHandRecord({ id: 'none', endedAt: 1 }));
    await repo.saveHand(makeHandRecord({ id: 'stale', endedAt: 2 }));
    await repo.saveHand(makeHandRecord({ id: 'fresh', endedAt: 3 }));
    await repo.saveAnalysis(analysisFor('stale', 1));
    await repo.saveAnalysis(analysisFor('fresh', 2));

    expect((await repo.listHandsNeedingAnalysis(2)).map((r) => r.id)).toEqual(['stale', 'none']);
  });

  it('deletes one hand with its analysis, and clears everything', async () => {
    const repo = newRepository();
    await repo.saveHand(makeHandRecord({ id: 'a', endedAt: 1 }));
    await repo.saveHand(makeHandRecord({ id: 'b', endedAt: 2 }));
    await repo.saveAnalysis(analysisFor('a'));

    await repo.deleteHand('a');
    expect(await repo.getHand('a')).toBeNull();
    expect(await repo.getAnalysis('a')).toBeNull();
    expect((await repo.listHands()).map((r) => r.id)).toEqual(['b']);

    await repo.clear();
    expect(await repo.listHands()).toEqual([]);
  });

  it('skips a stored row that fails validation instead of failing the read', async () => {
    const name = `test-db-${String(++dbCounter)}`;
    const repo = new IndexedDbHandHistoryRepository({ dbName: name });
    await repo.saveHand(makeHandRecord({ id: 'good', endedAt: 1 }));
    // Corrupt a row behind the repository's back.
    const { openDB } = await import('idb');
    const raw = await openDB(name, 1);
    await raw.put('hands', { id: 'bad', endedAt: 2 });
    raw.close();

    expect((await repo.listHands()).map((r) => r.id)).toEqual(['good']);
    expect(await repo.getHand('bad')).toBeNull();
  });
});

describe('IndexedDbHandHistoryRepository — localStorage migration', () => {
  it('moves valid legacy hands over, drops invalid ones and clears the legacy key', async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([makeHandRecord({ id: 'legacy-1', endedAt: 1 }), { id: 'junk' }]),
    );
    const repo = newRepository();

    expect((await repo.listHands()).map((r) => r.id)).toEqual(['legacy-1']);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('runs once: later legacy data is left alone', async () => {
    const name = `test-db-${String(++dbCounter)}`;
    await new IndexedDbHandHistoryRepository({ dbName: name }).listHands();
    localStorage.setItem(LEGACY_KEY, JSON.stringify([makeHandRecord({ id: 'late' })]));

    expect(await new IndexedDbHandHistoryRepository({ dbName: name }).listHands()).toEqual([]);
    expect(localStorage.getItem(LEGACY_KEY)).not.toBeNull();
  });

  it('keeps unparseable legacy data in place and retries on the next open', async () => {
    localStorage.setItem(LEGACY_KEY, '{not json');
    const name = `test-db-${String(++dbCounter)}`;

    expect(await new IndexedDbHandHistoryRepository({ dbName: name }).listHands()).toEqual([]);
    expect(localStorage.getItem(LEGACY_KEY)).toBe('{not json');

    localStorage.setItem(LEGACY_KEY, JSON.stringify([makeHandRecord({ id: 'fixed' })]));
    expect(
      (await new IndexedDbHandHistoryRepository({ dbName: name }).listHands()).map((r) => r.id),
    ).toEqual(['fixed']);
  });

  it('treats a legacy value that is not an array as empty and clears it', async () => {
    localStorage.setItem(LEGACY_KEY, JSON.stringify({ not: 'an array' }));
    const repo = newRepository();

    expect(await repo.listHands()).toEqual([]);
    expect(localStorage.getItem(LEGACY_KEY)).toBeNull();
  });

  it('applies the hand limit to migrated data', async () => {
    localStorage.setItem(
      LEGACY_KEY,
      JSON.stringify([
        makeHandRecord({ id: 'a', endedAt: 1 }),
        makeHandRecord({ id: 'b', endedAt: 2 }),
        makeHandRecord({ id: 'c', endedAt: 3 }),
      ]),
    );
    const repo = newRepository(2);

    expect((await repo.listHands()).map((r) => r.id)).toEqual(['c', 'b']);
  });
});
