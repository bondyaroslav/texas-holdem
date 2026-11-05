import type { ProjectedPlayer, ProjectedState } from '@poker/protocol';

// Derived from the protocol projection: features may not import the engine directly.
export type Card = ProjectedState['communityCards'][number];
export type PlayerStatus = ProjectedPlayer['status'];
export type { ProjectedState };
