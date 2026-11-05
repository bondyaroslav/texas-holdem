import { create } from 'zustand';
import type { SettingsRepository, TableConfig } from '@poker/protocol';
import { DEFAULT_TABLE_CONFIG } from './default-config.js';

export interface SettingsStoreState {
  readonly config: TableConfig;
  readonly setConfig: (config: TableConfig) => void;
  /** No-op if nothing is stored or it fails validation — keeps whatever `config` already is. */
  readonly loadFromRepository: (repository: SettingsRepository) => void;
  readonly saveToRepository: (repository: SettingsRepository) => void;
}

export const useSettingsStore = create<SettingsStoreState>()((set, get) => ({
  config: DEFAULT_TABLE_CONFIG,

  setConfig(config) {
    set({ config });
  },

  loadFromRepository(repository) {
    const stored = repository.load();
    if (stored) {
      set({ config: stored });
    }
  },

  saveToRepository(repository) {
    repository.save(get().config);
  },
}));
