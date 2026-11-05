import type { TableConfig } from './table-config.js';

/**
 * Storage boundary for the table configuration (CLAUDE.md §3.3: "Аналогічно:
 * StorageGateway (localStorage → API), SettingsRepository"). `LocalGameGateway`
 * has `LocalSettingsRepository` today; a server-backed implementation can
 * replace it later without the UI knowing.
 */
export interface SettingsRepository {
  /** Returns `null` when nothing is stored, or what's stored fails validation. */
  load(): TableConfig | null;
  save(config: TableConfig): void;
}
