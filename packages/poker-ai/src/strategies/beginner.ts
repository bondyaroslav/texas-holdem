import type { ActionInput } from '@poker/engine';
import type { BotStrategy, DecisionContext, PlayerView } from '../index.js';
import { difficultyProfiles } from '../difficulty-profiles.js';
import { isUnderRaiseCap, minimumLegalBetOrRaise } from '../bet-sizing.js';

/**
 * Loose-passive (CLAUDE.md §5): plays almost every hand, rarely raises,
 * mostly calls. Deliberately ignores hole-card strength — its only inputs
 * are the pot/stack shape of the decision and the injected RNG, which drives
 * the occasional unexplainable fold or raise ("intentional mistakes").
 * Actions are always legal, just not card-aware.
 */
export const beginnerStrategy: BotStrategy = {
  decide(view: PlayerView, ctx: DecisionContext): ActionInput {
    const profile = difficultyProfiles.beginner;

    const mayRaise = isUnderRaiseCap(view, profile.maxRaiseBigBlinds);

    if (view.toCall <= 0) {
      return mayRaise && ctx.rng.next() < profile.raiseFrequency
        ? minimumLegalBetOrRaise(view)
        : { kind: 'check' };
    }

    if (view.toCall >= view.stack) {
      // Can't fully call — stick around all-in rather than folding.
      return { kind: 'allIn' };
    }

    const roll = ctx.rng.next();
    if (roll < profile.foldFrequency) {
      return { kind: 'fold' };
    }
    if (mayRaise && roll < profile.foldFrequency + profile.raiseFrequency) {
      return minimumLegalBetOrRaise(view);
    }
    return { kind: 'call' };
  },
};
