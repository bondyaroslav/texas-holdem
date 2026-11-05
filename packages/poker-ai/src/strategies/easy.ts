import type { ActionInput } from '@poker/engine';
import { evaluateBestHand, HAND_CATEGORY_ORDER } from '@poker/engine';
import type { BotStrategy, DecisionContext, PlayerView } from '../index.js';
import { difficultyProfiles } from '../difficulty-profiles.js';
import { isUnderRaiseCap, minimumLegalBetOrRaise } from '../bet-sizing.js';
import { preflopHandScore } from '../hand-strength.js';

function strengthFor(view: PlayerView): number {
  if (view.communityCards.length === 0) {
    return preflopHandScore(view.holeCards);
  }
  const rank = evaluateBestHand([...view.holeCards, ...view.communityCards]);
  return HAND_CATEGORY_ORDER[rank.category];
}

/**
 * Preflop via a simple hand-strength table; postflop by current combination —
 * pair or better continues (CLAUDE.md §5). No position awareness, no
 * randomness: a mechanical rule-follower, one threshold check per decision.
 */
export const easyStrategy: BotStrategy = {
  decide(view: PlayerView, _ctx: DecisionContext): ActionInput {
    const isPreflop = view.communityCards.length === 0;
    const profile = difficultyProfiles.easy;
    const continueThreshold = isPreflop
      ? profile.preflopCallThreshold
      : profile.minPostflopContinueCategory;
    const raiseThreshold = isPreflop
      ? profile.preflopRaiseThreshold
      : profile.minPostflopRaiseCategory;
    const strength = strengthFor(view);

    const wantsToContinue = strength >= continueThreshold;
    // Capped so two strong bots can't re-raise each other until someone is all-in.
    const wantsToRaise =
      strength >= raiseThreshold && isUnderRaiseCap(view, profile.maxRaiseBigBlinds);

    if (view.toCall <= 0) {
      return wantsToRaise ? minimumLegalBetOrRaise(view) : { kind: 'check' };
    }

    if (!wantsToContinue) {
      return { kind: 'fold' };
    }
    if (view.toCall >= view.stack) {
      return { kind: 'allIn' };
    }
    return wantsToRaise ? minimumLegalBetOrRaise(view) : { kind: 'call' };
  },
};
