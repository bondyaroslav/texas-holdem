import type { PlayerId } from '@poker/engine';
import type { ExplanationMessage, HandOutcome } from '@poker/protocol';

/**
 * i18n messages describing how the pot(s) were decided, in reading order:
 * fold win, each pot at showdown, the hero's all-in luck, the hero's result.
 */
export function explainOutcome(
  outcome: Omit<HandOutcome, 'explanations'>,
  heroId: PlayerId,
  bigBlind: number,
): readonly ExplanationMessage[] {
  const messages: ExplanationMessage[] = [];
  const categoryOf = (id: PlayerId | undefined): string =>
    outcome.players.find((p) => p.playerId === id)?.bestHand?.category ?? '';

  if (outcome.foldWin) {
    const { winnerId, street, lastAggression, foldedPlayerIds } = outcome.foldWin;
    messages.push({
      key: lastAggression ? 'outcome.foldWin.toBet' : 'outcome.foldWin.noBet',
      params: {
        winner: winnerId,
        street,
        folded: foldedPlayerIds.length,
        ...(lastAggression
          ? { bettor: lastAggression.playerId, amount: lastAggression.amount }
          : {}),
      },
    });
  }

  if (outcome.showdown) {
    outcome.pots.forEach((pot, index) => {
      const winners = pot.shares.map((s) => s.playerId);
      const params: Record<string, string | number> = {
        pot: index === 0 ? 'main' : 'side',
        index,
        amount: pot.amount,
        winners: winners.join(','),
        category: categoryOf(winners[0]),
      };
      if (pot.kickerRank !== null) params.kickerRank = pot.kickerRank;
      messages.push({ key: `outcome.pot.${pot.decidedBy}`, params });
    });
  }

  if (outcome.allIn) {
    const { heroEquity, expectedNet, actualNet, street } = outcome.allIn;
    const luckBb = (actualNet - expectedNet) / bigBlind;
    messages.push({
      key: luckBb >= 0 ? 'outcome.allIn.ranGood' : 'outcome.allIn.ranBad',
      params: {
        street,
        equityPct: Math.round(heroEquity * 100),
        expectedBb: Math.round((expectedNet / bigBlind) * 10) / 10,
        actualBb: Math.round((actualNet / bigBlind) * 10) / 10,
        luckBb: Math.round(luckBb * 10) / 10,
      },
    });
  }

  const hero = outcome.players.find((p) => p.playerId === heroId);
  if (hero) {
    messages.push({
      key:
        hero.net > 0
          ? 'outcome.hero.won'
          : hero.net < 0
            ? 'outcome.hero.lost'
            : 'outcome.hero.even',
      params: { net: hero.net, netBb: Math.round((hero.net / bigBlind) * 10) / 10 },
    });
  }
  return messages;
}
