import type { TableConfig } from '@poker/protocol';

export const DEFAULT_TABLE_CONFIG: TableConfig = {
  schemaVersion: 1,
  botCount: 3,
  startingStack: 1000,
  smallBlind: 5,
  bigBlind: 10,
  ante: 0,
  isTournament: false,
  botDifficulty: 'easy',
};
