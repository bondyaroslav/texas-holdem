import type { JSX } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import type { HandAnalysis, HandRecord } from '@poker/protocol';
import { LineChart, TermLink } from '@/shared';
import { equitySeries } from './model/equity-series.js';
import { formatMessage } from './model/format-message.js';

export interface EquityChartProps {
  readonly record: HandRecord;
  readonly analysis: HandAnalysis;
  readonly playerName: (id: string) => string;
}

/** Everyone's equity street by street, with the turning points spelled out below. */
export function EquityChart({ record, analysis, playerName }: EquityChartProps): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const model = equitySeries(record, analysis);

  return (
    <section aria-labelledby={headingId} className="panel flex flex-col gap-4">
      <h2 id={headingId} className="text-xl font-extrabold">
        <TermLink term="equity">{t('review.equity.title')}</TermLink>
      </h2>
      {model.streets.length === 0 ? (
        <p style={{ color: 'var(--color-muted)' }}>{t('review.equity.none')}</p>
      ) : (
        <LineChart
          title={t('review.equity.chartLabel')}
          xLabels={model.streets.map((s) => t(`streets.${s}`))}
          xHeader={t('review.equity.street')}
          series={model.players.map((p) => ({
            id: p.id,
            label: playerName(p.id),
            values: p.values,
            slot: p.slot,
            emphasis: p.id === record.heroId,
          }))}
          yDomain={[0, 100]}
          formatY={(v) => `${String(Math.round(v))}%`}
          showTableLabel={t('review.equity.showTable')}
        />
      )}

      {analysis.turningPoints.length > 0 ? (
        <div>
          <h3 className="mb-2 font-bold">{t('review.turning.title')}</h3>
          <ul className="flex list-disc flex-col gap-1 pl-5 text-sm">
            {analysis.turningPoints.map((point) => (
              <li key={`${point.kind}-${point.playerId}-${point.street}`}>
                {formatMessage(
                  {
                    key: `review.turning.${point.kind}`,
                    params: {
                      player: point.playerId,
                      street: point.street,
                      before: Math.round(point.equityBefore * 100),
                      after: Math.round(point.equityAfter * 100),
                    },
                  },
                  t,
                  playerName,
                )}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}
