import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { TableConfig } from '@poker/protocol';
import { LocalSettingsRepository } from '@/infrastructure/local-settings-repository';

const STORAGE_KEY = 'texas-holdem:table-config';

const validConfig: TableConfig = {
  schemaVersion: 1,
  botCount: 4,
  startingStack: 2000,
  smallBlind: 10,
  bigBlind: 20,
  ante: 0,
  isTournament: false,
  botDifficulty: 'beginner',
};

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  localStorage.clear();
});

describe('LocalSettingsRepository', () => {
  it('returns null when nothing has been saved yet', () => {
    const repository = new LocalSettingsRepository();
    expect(repository.load()).toBeNull();
  });

  it('round-trips a saved config', () => {
    const repository = new LocalSettingsRepository();
    repository.save(validConfig);
    expect(repository.load()).toEqual(validConfig);
  });

  it('falls back to null when the stored value is not valid JSON', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    const repository = new LocalSettingsRepository();
    expect(repository.load()).toBeNull();
  });

  it('falls back to null when the stored value fails schema validation', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...validConfig, botCount: 99 }));
    const repository = new LocalSettingsRepository();
    expect(repository.load()).toBeNull();
  });
});
