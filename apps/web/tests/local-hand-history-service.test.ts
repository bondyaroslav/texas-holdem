import { describe, expect, it } from 'vitest';
import { IndexedDbHandHistoryRepository } from '@/infrastructure/indexed-db-hand-history-repository';
import { LocalHandHistoryService } from '@/infrastructure/local-hand-history-service';
import { LocalHistoryPreferences } from '@/infrastructure/local-history-preferences';
import { analyse, playHands } from './fixtures/played-hands';

let counter = 0;

describe('LocalHandHistoryService', () => {
  it('lists stored hands with their analysis and summary, and computes stats and leaks', async () => {
    const preferences = new LocalHistoryPreferences();
    const repository = new IndexedDbHandHistoryRepository({
      dbName: `service-${String(++counter)}`,
      maxHands: () => preferences.getMaxHands(),
    });
    const service = new LocalHandHistoryService(repository, preferences, () => 42);
    const records = await playHands(7, 3);
    for (const r of records) await repository.saveHand(r);
    const first = records[0];
    if (!first) throw new Error('no hands');
    await repository.saveAnalysis(analyse(first));

    const entries = await service.list();
    expect(entries.map((e) => e.record.id)).toEqual([...records].reverse().map((r) => r.id));
    expect(entries.find((e) => e.record.id === first.id)?.analysis).not.toBeNull();
    expect(entries.filter((e) => e.analysis === null)).toHaveLength(records.length - 1);
    expect((await service.get(first.id))?.summary.heroPosition).toBeDefined();
    expect(await service.get('missing')).toBeNull();
    expect(service.stats(entries).hands).toBe(records.length);
    expect(service.leaks(entries)).toEqual([]);
    expect(service.sessionStartedAt).toBe(42);
  });

  it('notifies subscribers, clears and applies the stored limit', async () => {
    localStorage.clear();
    const preferences = new LocalHistoryPreferences();
    const repository = new IndexedDbHandHistoryRepository({
      dbName: `service-${String(++counter)}`,
      maxHands: () => preferences.getMaxHands(),
    });
    const service = new LocalHandHistoryService(repository, preferences);
    let calls = 0;
    const unsubscribe = service.subscribe(() => calls++);

    expect(service.getMaxHands()).toBe(1000);
    service.setMaxHands(100);
    expect(service.getMaxHands()).toBe(100);
    service.setMaxHands(-5); // ignored: invalid
    expect(service.getMaxHands()).toBe(100);
    localStorage.setItem('texas-holdem:history-max-hands', 'garbage');
    expect(service.getMaxHands()).toBe(1000);

    for (const r of await playHands(8, 2)) await repository.saveHand(r);
    await service.clear();
    expect(await service.list()).toEqual([]);
    expect(calls).toBe(1);
    unsubscribe();
    service.notifyChanged();
    expect(calls).toBe(1);
  });
});
