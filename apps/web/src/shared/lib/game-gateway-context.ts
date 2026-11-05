import { createContext, useContext } from 'react';
import type { GameGateway } from '@poker/protocol';

/**
 * The composition root (`app/`) provides the concrete `GameGateway`
 * implementation (`LocalGameGateway` today, a `RemoteGameGateway` later);
 * everything below only ever sees the interface (CLAUDE.md §3.3).
 */
export const GameGatewayContext = createContext<GameGateway | null>(null);

export function useGameGateway(): GameGateway {
  const gateway = useContext(GameGatewayContext);
  if (!gateway) {
    throw new Error('useGameGateway must be used within a GameGatewayContext.Provider');
  }
  return gateway;
}
