import type { JSX } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { HandOutcome } from '@poker/protocol';
import { Card } from '@/entities/card';
import { formatMessage } from './model/format-message.js';

export interface OutcomePanelProps {
  readonly outcome: HandOutcome;
  readonly playerName: (id: string) => string;
}

/** How the pot(s) were decided: best five cards, kickers, side pots, folds. */
export function OutcomePanel({ outcome, playerName }: OutcomePanelProps): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const shown = outcome.players.filter((p) => p.bestHand !== null);

  return (
    <section aria-labelledby={headingId} className="panel flex flex-col gap-4">
      <h2 id={headingId} className="text-xl font-extrabold">
        {t('review.outcome.title')}
      </h2>
      <ul className="flex list-disc flex-col gap-1 pl-5">
        {outcome.explanations.map((message) => (
          <li key={`${message.key}-${JSON.stringify(message.params)}`}>
            {formatMessage(message, t, playerName)}
          </li>
        ))}
      </ul>

      {shown.length > 0 ? (
        <ul className="flex flex-col gap-2">
          {shown.map((p) => (
            <li key={p.playerId} className="flex flex-wrap items-center gap-3">
              <span className="min-w-24 font-semibold">{playerName(p.playerId)}</span>
              <span className="flex gap-1" role="group" aria-label={t('review.outcome.bestFive')}>
                {p.bestHand?.cards.map((c) => (
                  <Card key={`${c.rank}${c.suit}`} rank={c.rank} suit={c.suit} />
                ))}
              </span>
              <span style={{ color: 'var(--color-muted)' }}>
                {p.bestHand ? t(`handRankings.items.${p.bestHand.category}.name`) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
