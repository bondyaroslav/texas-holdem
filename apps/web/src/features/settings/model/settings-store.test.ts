import { describe, expect, it } from 'vitest';
import type { SettingsRepository, TableConfig } from '@poker/protocol';
import { useSettingsStore } from './settings-store.js';
import { DEFAULT_TABLE_CONFIG } from './default-config.js';

function fakeRepository(initial: TableConfig | null = null): SettingsRepository {
  let stored = initial;
  return {
    load: () => stored,
    save: (config) => {
      stored = config;
    },
  };
}

describe('useSettingsStore', () => {
  it('starts with the default table config', () => {
    expect(useSettingsStore.getState().config).toEqual(DEFAULT_TABLE_CONFIG);
  });

  it('setConfig replaces the current config', () => {
    const next: TableConfig = { ...DEFAULT_TABLE_CONFIG, botCount: 6 };
    useSettingsStore.getState().setConfig(next);
    expect(useSettingsStore.getState().config).toEqual(next);
    useSettingsStore.getState().setConfig(DEFAULT_TABLE_CONFIG);
  });

  it('loadFromRepository hydrates from a stored config', () => {
    const stored: TableConfig = { ...DEFAULT_TABLE_CONFIG, botCount: 7, botDifficulty: 'beginner' };
    useSettingsStore.getState().loadFromRepository(fakeRepository(stored));
    expect(useSettingsStore.getState().config).toEqual(stored);
    useSettingsStore.getState().setConfig(DEFAULT_TABLE_CONFIG);
  });

  it('loadFromRepository leaves the config untouched when nothing is stored', () => {
    useSettingsStore.getState().setConfig(DEFAULT_TABLE_CONFIG);
    useSettingsStore.getState().loadFromRepository(fakeRepository(null));
    expect(useSettingsStore.getState().config).toEqual(DEFAULT_TABLE_CONFIG);
  });

  it('saveToRepository persists the current config', () => {
    const repository = fakeRepository(null);
    const next: TableConfig = { ...DEFAULT_TABLE_CONFIG, startingStack: 5000 };
    useSettingsStore.getState().setConfig(next);
    useSettingsStore.getState().saveToRepository(repository);
    expect(repository.load()).toEqual(next);
    useSettingsStore.getState().setConfig(DEFAULT_TABLE_CONFIG);
  });
});
