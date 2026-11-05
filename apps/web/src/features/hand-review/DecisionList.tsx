import type { JSX } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { DecisionAnalysis } from '@poker/protocol';
import { VerdictBadge } from '@/entities/verdict';
import { TermLink } from '@/shared';
import { formatMessage } from './model/format-message.js';

export type EquityView = 'range' | 'known';

export interface DecisionListProps {
  readonly decisions: readonly DecisionAnalysis[];
  readonly bigBlind: number;
  readonly view: EquityView;
  readonly onViewChange: (view: EquityView) => void;
  readonly onShowInReplay: (eventIndex: number) => void;
  readonly playerName: (id: string) => string;
}

const pct = (value: number): string => `${String(Math.round(value * 100))}%`;
const bb = (value: number): string => `${value > 0 ? '+' : ''}${value.toFixed(1)}`;

/** One card per hero decision: verdict, the numbers behind it, alternatives and why. */
export function DecisionList(props: DecisionListProps): JSX.Element {
  const { decisions, bigBlind, view, onViewChange, onShowInReplay, playerName } = props;
  const { t } = useTranslation();
  const headingId = useId();

  return (
    <section aria-labelledby={headingId} className="panel flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 id={headingId} className="text-xl font-extrabold">
          {t('review.decisions.title')}
        </h2>
        <fieldset className="flex overflow-hidden rounded-lg border border-white/10 text-sm">
          <legend className="sr-only">{t('review.decisions.viewLegend')}</legend>
          {(['range', 'known'] as const).map((option) => (
            <label
              key={option}
              className="cursor-pointer px-3 py-1.5 font-semibold has-checked:bg-amber-300 has-checked:text-black"
            >
              <input
                type="radio"
                name={`${headingId}-view`}
                value={option}
                checked={view === option}
                onChange={() => {
                  onViewChange(option);
                }}
                className="sr-only"
              />
              {t(`review.decisions.view.${option}`)}
            </label>
          ))}
        </fieldset>
      </div>

      {view === 'known' ? (
        <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {t('review.decisions.knownNote')}
        </p>
      ) : null}

      {decisions.length === 0 ? (
        <p style={{ color: 'var(--color-muted)' }}>{t('review.decisions.none')}</p>
      ) : (
        <ol className="flex flex-col gap-3">
          {decisions.map((d) => {
            const equity = view === 'known' && d.knownCards ? d.knownCards.equity : d.equity;
            const best = d.alternatives.find((a) => a.kind === d.bestKind);
            return (
              <li
                key={d.eventIndex}
                className="rounded-xl border p-4"
                style={{ borderColor: 'var(--color-border)' }}
              >
                <article
                  aria-label={t('review.decisions.cardLabel', {
                    street: t(`streets.${d.street}`),
                    action: t(`review.action.${d.action.kind}`),
                  })}
                >
                  <header className="flex flex-wrap items-center gap-2">
                    <span
                      className="text-sm font-bold uppercase"
                      style={{ color: 'var(--color-muted)' }}
                    >
                      {t(`streets.${d.street}`)}
                    </span>
                    <span className="font-extrabold">
                      {t(`review.action.${d.action.kind}`)}
                      {d.action.amount !== undefined ? ` ${String(d.action.amount)}` : ''}
                    </span>
                    <VerdictBadge verdict={d.verdict} />
                  </header>

                  <p className="mt-2">{formatMessage(d.explanation, t, playerName)}</p>

                  <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                    <div>
                      <dt style={{ color: 'var(--color-muted)' }}>
                        <TermLink term="equity">{t('review.decisions.equity')}</TermLink>
                      </dt>
                      <dd className="font-bold tabular-nums">{pct(equity)}</dd>
                    </div>
                    <div>
                      <dt style={{ color: 'var(--color-muted)' }}>
                        <TermLink term="potOdds">{t('review.decisions.required')}</TermLink>
                      </dt>
                      <dd className="font-bold tabular-nums">
                        {d.requiredEquity === null ? '—' : pct(d.requiredEquity)}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: 'var(--color-muted)' }}>
                        {t('review.decisions.potToCall')}
                      </dt>
                      <dd className="font-bold tabular-nums">
                        {d.pot} / {d.toCall}
                      </dd>
                    </div>
                    <div>
                      <dt style={{ color: 'var(--color-muted)' }}>
                        <TermLink term="evLoss">{t('review.decisions.evLoss')}</TermLink>
                      </dt>
                      <dd className="font-bold tabular-nums">{d.evLossBb.toFixed(1)} bb</dd>
                    </div>
                  </dl>

                  <table className="mt-3 w-full text-left text-sm">
                    <caption className="sr-only">{t('review.decisions.alternatives')}</caption>
                    <thead style={{ color: 'var(--color-muted)' }}>
                      <tr>
                        <th scope="col" className="py-1 pr-3">
                          {t('review.decisions.option')}
                        </th>
                        <th scope="col" className="py-1 pr-3">
                          <TermLink term="ev">EV</TermLink> (bb)
                        </th>
                        <th scope="col" className="py-1">
                          {t('review.decisions.note')}
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {d.alternatives.map((alt) => {
                        const knownCall =
                          view === 'known' &&
                          d.knownCards &&
                          (alt.kind === 'call' || alt.kind === 'check')
                            ? d.knownCards.callEv / bigBlind
                            : null;
                        const notes = [
                          alt.kind === d.action.kind ||
                          (d.action.kind === 'bet' && alt.kind === 'raise') ||
                          (d.action.kind === 'raise' && alt.kind === 'bet')
                            ? t('review.decisions.chosen')
                            : null,
                          alt === best ? t('review.decisions.best') : null,
                          alt.estimate ? t('review.decisions.estimate') : null,
                        ].filter((n): n is string => n !== null);
                        return (
                          <tr key={alt.kind}>
                            <th scope="row" className="py-1 pr-3 font-semibold">
                              {t(`review.action.${alt.kind}`)}
                              {alt.amount !== undefined ? ` ${String(alt.amount)}` : ''}
                            </th>
                            <td className="py-1 pr-3 tabular-nums">
                              {alt.estimate ? '≈ ' : ''}
                              {bb(knownCall ?? alt.evBb)}
                            </td>
                            <td className="py-1">{notes.join(' · ')}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  <button
                    type="button"
                    className="btn btn-pill mt-3"
                    onClick={() => {
                      onShowInReplay(d.eventIndex);
                    }}
                  >
                    {t('review.decisions.showInReplay')}
                  </button>
                </article>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
