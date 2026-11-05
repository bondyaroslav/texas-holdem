import { createContext, useContext } from 'react';
import type { SettingsRepository } from '@poker/protocol';

/** Same DI pattern as `GameGatewayContext` — `app/` picks the implementation. */
export const SettingsRepositoryContext = createContext<SettingsRepository | null>(null);

export function useSettingsRepository(): SettingsRepository {
  const repository = useContext(SettingsRepositoryContext);
  if (!repository) {
    throw new Error(
      'useSettingsRepository must be used within a SettingsRepositoryContext.Provider',
    );
  }
  return repository;
}
