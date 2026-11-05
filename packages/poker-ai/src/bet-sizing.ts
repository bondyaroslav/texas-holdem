import type { ActionInput } from '@poker/engine';
import { toChips } from '@poker/engine';
import type { PlayerView } from './index.js';

/**
 * Smallest legal bet or raise for this view. Callers must already know the
 * player can afford to continue (e.g. `view.toCall < view.stack`) — this
 * never returns `allIn`, that's a separate decision for the caller to make.
 */
export function minimumLegalBetOrRaise(view: PlayerView): ActionInput {
  if (view.currentBet <= 0) {
    const amount = toChips(Math.min(view.bigBlind, view.stack));
    return { kind: 'bet', amount };
  }

  const maxTotalCommit = view.committedThisStreet + view.stack;
  const desiredTotalCommit = view.currentBet + view.minRaise;
  const amount = toChips(Math.min(desiredTotalCommit, maxTotalCommit));
  return { kind: 'raise', amount };
}

/** False once the street's bet is already `maxRaiseBigBlinds` big blinds or more — time to stop raising. */
export function isUnderRaiseCap(view: PlayerView, maxRaiseBigBlinds: number): boolean {
  return view.currentBet < maxRaiseBigBlinds * view.bigBlind;
}

/**
 * Bet or raise to `total` chips committed this street, made legal: never below
 * the minimum, and an all-in once it would take the whole stack.
 */
export function betOrRaiseTo(view: PlayerView, total: number): ActionInput {
  const maxTotal = view.committedThisStreet + view.stack;
  const minTotal =
    view.currentBet <= 0 ? Math.min(view.bigBlind, maxTotal) : view.currentBet + view.minRaise;
  const target = Math.round(Math.max(total, minTotal));
  if (target >= maxTotal) return { kind: 'allIn' };
  return view.currentBet <= 0
    ? { kind: 'bet', amount: toChips(target) }
    : { kind: 'raise', amount: toChips(target) };
}

/** A bet of `fraction` of the pot, or a raise of `fraction` of the pot after calling. */
export function potFractionBet(view: PlayerView, fraction: number): ActionInput {
  if (view.currentBet <= 0) return betOrRaiseTo(view, fraction * view.potSize);
  const potAfterCall = view.potSize + view.toCall;
  return betOrRaiseTo(view, view.currentBet + fraction * potAfterCall);
}

/** Raising needs chips beyond the call and someone left who can still respond. */
export function canRaise(view: PlayerView): boolean {
  return view.stack > view.toCall && view.opponents.some((o) => !o.allIn);
}
