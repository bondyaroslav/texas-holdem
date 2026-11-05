import type { JSX, ReactNode } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import type { Rate } from '@poker/protocol';
import { SeverityBadge } from '@/entities/verdict';
import { LineChart, TermLink, useHandEntries, useHandHistoryService } from '@/shared';
import { cumulativeWinnings } from './model/winnings-series.js';

type Scope = 'session' | 'all';

const pct = (rate: Rate): string =>
  rate.value === null ? '—' : `${String(Math.round(rate.value * 100))}%`;
const signed = (value: number, digits = 1): string =>
  `${value > 0 ? '+' : ''}${value.toFixed(digits)}`;

function Tile({
  term,
  label,
  value,
  hint,
}: {
  term?: string;
  label: string;
  value: string;
  hint?: string;
}): JSX.Element {
  return (
    <div className="rounded-xl border p-3" style={{ borderColor: 'var(--color-border)' }}>
      <dt className="text-sm" style={{ color: 'var(--color-muted)' }}>
        {term ? <TermLink term={term}>{label}</TermLink> : label}
      </dt>
      <dd className="text-2xl font-black tabular-nums">{value}</dd>
      {hint ? (
        <dd className="text-xs" style={{ color: 'var(--color-muted)' }}>
          {hint}
        </dd>
      ) : null}
    </div>
  );
}

/** Session / all-time numbers, expected-vs-actual winnings and the hero's leaks. */
export function StatsView(): JSX.Element {
  const { t } = useTranslation();
  const service = useHandHistoryService();
  const loaded = useHandEntries();
  const [scope, setScope] = useState<Scope>('all');

  if (loaded.status === 'loading') return <p role="status">{t('history.loading')}</p>;
  if (loaded.status === 'error') return <p role="alert">{t('history.error')}</p>;

  const entries =
    scope === 'all'
      ? loaded.value
      : loaded.value.filter((e) => e.record.endedAt >= service.sessionStartedAt);
  const stats = service.stats(entries);
  const leaks = service.leaks(entries);
  const winnings = cumulativeWinnings(entries);
  const handNumbers = new Map(loaded.value.map((e) => [e.record.id, e.record.handNumber]));

  let body: ReactNode;
  if (entries.length === 0) {
    body = <p className="panel">{t('stats.empty')}</p>;
  } else {
    body = (
      <>
        <section className="panel" aria-label={t('stats.numbers')}>
          <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Tile label={t('stats.hands')} value={String(stats.hands)} />
            <Tile term="bb" label={t('stats.net')} value={`${signed(stats.netBb)} bb`} />
            <Tile
              term="bb100"
              label="bb/100"
              value={stats.bbPer100 === null ? '—' : signed(stats.bbPer100)}
            />
            <Tile
              term="accuracy"
              label={t('stats.accuracy')}
              value={
                stats.decisions.accuracy === null
                  ? '—'
                  : `${String(Math.round(stats.decisions.accuracy * 100))}%`
              }
              hint={t('stats.decisionsHint', {
                total: stats.decisions.total,
                loss: stats.decisions.evLossBb.toFixed(1),
              })}
            />
            <Tile term="vpip" label="VPIP" value={pct(stats.vpip)} />
            <Tile term="pfr" label="PFR" value={pct(stats.pfr)} />
            <Tile
              term="af"
              label="AF"
              value={stats.aggression.factor === null ? '—' : stats.aggression.factor.toFixed(2)}
            />
            <Tile term="wtsd" label="WTSD" value={pct(stats.wtsd)} />
            <Tile term="wsd" label="W$SD" value={pct(stats.wsd)} />
            <Tile
              term="allInEv"
              label={t('stats.allInLuck')}
              value={`${signed(stats.allIn.luckBb)} bb`}
              hint={t('stats.allInHint', {
                hands: stats.allIn.hands,
                expected: stats.allIn.expectedBb.toFixed(1),
                actual: stats.allIn.actualBb.toFixed(1),
              })}
            />
          </dl>
        </section>

        <section className="panel flex flex-col gap-3" aria-labelledby="stats-winnings">
          <h2 id="stats-winnings" className="text-xl font-extrabold">
            {t('stats.winningsTitle')}
          </h2>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {t('stats.winningsHint')}
          </p>
          <LineChart
            title={t('stats.winningsTitle')}
            xLabels={winnings.actual.map((_, i) => String(i + 1))}
            xHeader={t('stats.handIndex')}
            series={[
              {
                id: 'actual',
                label: t('stats.actual'),
                values: winnings.actual,
                slot: 1,
                emphasis: true,
              },
              {
                id: 'expected',
                label: t('stats.expected'),
                values: winnings.expected,
                slot: 2,
                dashed: true,
              },
            ]}
            yDomain={[
              Math.min(0, ...winnings.actual, ...winnings.expected),
              Math.max(1, ...winnings.actual, ...winnings.expected),
            ]}
            formatY={(v) => `${signed(v)} bb`}
            showTableLabel={t('stats.showTable')}
          />
        </section>

        <section className="panel flex flex-col gap-3" aria-labelledby="stats-leaks">
          <h2 id="stats-leaks" className="text-xl font-extrabold">
            {t('stats.leaksTitle')}
          </h2>
          {leaks.length === 0 ? (
            <p style={{ color: 'var(--color-muted)' }}>{t('stats.noLeaks')}</p>
          ) : (
            <ul className="flex flex-col gap-3">
              {leaks.map((leak) => (
                <li
                  key={leak.id}
                  className="rounded-xl border p-4"
                  style={{ borderColor: 'var(--color-border)' }}
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <SeverityBadge severity={leak.severity} />
                    <h3 className="font-extrabold">{t(`leak.${leak.id}.title`)}</h3>
                  </div>
                  <p className="mt-1">{t(`leak.${leak.id}.text`, leak.explanation.params)}</p>
                  {leak.handIds.length > 0 ? (
                    <p className="mt-2 flex flex-wrap gap-2 text-sm">
                      <span style={{ color: 'var(--color-muted)' }}>{t('stats.examples')}</span>
                      {leak.handIds.slice(0, 8).map((id) => (
                        <Link
                          key={id}
                          to={`/history/${encodeURIComponent(id)}`}
                          className="underline"
                        >
                          {t('history.hand', { number: handNumbers.get(id) ?? '?' })}
                        </Link>
                      ))}
                    </p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>
      </>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="flex w-fit overflow-hidden rounded-lg border border-white/10 text-sm">
        <legend className="sr-only">{t('stats.scope')}</legend>
        {(['session', 'all'] as const).map((option) => (
          <label
            key={option}
            className="cursor-pointer px-3 py-1.5 font-semibold has-checked:bg-amber-300 has-checked:text-black"
          >
            <input
              type="radio"
              name="stats-scope"
              value={option}
              checked={scope === option}
              onChange={() => {
                setScope(option);
              }}
              className="sr-only"
            />
            {t(`stats.scopes.${option}`)}
          </label>
        ))}
      </fieldset>
      {body}
    </div>
  );
}
