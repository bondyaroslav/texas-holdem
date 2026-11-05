import type { Chips, PlayerId } from './types.js';

export type ActionInput =
  | { readonly kind: 'fold' }
  | { readonly kind: 'check' }
  | { readonly kind: 'call' }
  | { readonly kind: 'bet'; readonly amount: Chips }
  | { readonly kind: 'raise'; readonly amount: Chips }
  | { readonly kind: 'allIn' };

export type EngineCommand =
  | { readonly type: 'startHand' }
  | { readonly type: 'playerAction'; readonly playerId: PlayerId; readonly action: ActionInput }
  | { readonly type: 'advanceStreet' }
  // `rankedGroups` is strongest-hand-first, each entry a tie group; stands in for
  // the not-yet-built hand evaluator (CLAUDE.md §3.2), which will supply this.
  | { readonly type: 'resolveShowdown'; readonly rankedGroups: readonly (readonly PlayerId[])[] };
