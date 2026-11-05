import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/entities/card';
import { HAND_RANKINGS } from './hand-rankings-data.js';

/** Cheat sheet of poker hands, strongest first — a reference the player can open mid-game. */
export function HandRankings(): JSX.Element {
  const { t } = useTranslation();

  return (
    <ol className="flex flex-col gap-3">
      {HAND_RANKINGS.map((entry, index) => (
        <li key={entry.id} className="panel flex flex-wrap items-center gap-4 p-4">
          <span
            aria-hidden="true"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-black"
            style={{ background: 'var(--color-accent)', color: 'var(--color-accent-fg)' }}
          >
            {index + 1}
          </span>

          <div className="min-w-48 flex-1">
            <h2 className="text-lg font-extrabold">{t(`handRankings.items.${entry.id}.name`)}</h2>
            <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
              {t(`handRankings.items.${entry.id}.description`)}
            </p>
          </div>

          <div className="flex gap-1.5">
            {entry.cards.map((card) => (
              <span key={`${card.rank}-${card.suit}`} className={card.counts ? '' : 'opacity-40'}>
                <Card rank={card.rank} suit={card.suit} />
              </span>
            ))}
          </div>
        </li>
      ))}
    </ol>
  );
}
