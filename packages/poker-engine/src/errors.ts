import type { PlayerId } from './types.js';

export type EngineError =
  | { readonly code: 'handAlreadyInProgress' }
  | { readonly code: 'noHandInProgress' }
  | { readonly code: 'notEnoughPlayers' }
  | { readonly code: 'unknownPlayer'; readonly playerId: PlayerId }
  | {
      readonly code: 'notPlayersTurn';
      readonly expected: PlayerId | null;
      readonly actual: PlayerId;
    }
  | { readonly code: 'illegalAction'; readonly reason: string }
  | { readonly code: 'bettingRoundNotComplete' }
  | { readonly code: 'notAtShowdown' }
  | {
      readonly code: 'noRankingForEligiblePlayers';
      readonly eligiblePlayerIds: readonly PlayerId[];
    };
