import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { VERDICTS } from '@poker/protocol';
import { useHandEntries, useHandHistoryService, type HandEntry } from '@/shared';
import { applyFilters, NO_FILTERS, type HandFilters } from './model/filters.js';
import { downloadText, formatHandsText } from './model/hand-text.js';

const POSITIONS = ['utg', 'mp', 'hj', 'co', 'btn', 'sb', 'bb'] as const;
const STREETS = ['preflop', 'flop', 'turn', 'river', 'showdown'] as const;
const BOT_LEVELS = ['beginner', 'easy', 'medium', 'hard', 'expert'] as const;

/** Finished hands with result, accuracy and labels; filterable, exportable, clearable. */
export function HandHistoryList(): JSX.Element {
  const { t, i18n } = useTranslation();
  const service = useHandHistoryService();
  const entries = useHandEntries();
  const [filters, setFilters] = useState<HandFilters>(NO_FILTERS);
  const [confirmClear, setConfirmClear] = useState(false);

  if (entries.status === 'loading') {
    return <p role="status">{t('history.loading')}</p>;
  }
  if (entries.status === 'error') {
    return <p role="alert">{t('history.error')}</p>;
  }
  if (entries.value.length === 0) {
    return (
      <div className="panel text-center">
        <p>{t('history.empty')}</p>
        <Link to="/table" className="btn btn-primary mt-4">
          {t('history.play')}
        </Link>
      </div>
    );
  }

  const shown = applyFilters(entries.value, filters);
  const select = (
    key: keyof HandFilters,
    options: readonly string[],
    labelFor: (option: string) => string,
  ): JSX.Element => (
    <label className="flex flex-col gap-1 text-sm font-semibold">
      {t(`history.filters.${key}`)}
      <select
        className="field"
        value={filters[key]}
        onChange={(event) => {
          setFilters({ ...filters, [key]: event.target.value });
        }}
      >
        <option value="all">{t('history.filters.all')}</option>
        {options.map((o) => (
          <option key={o} value={o}>
            {labelFor(o)}
          </option>
        ))}
      </select>
    </label>
  );

  return (
    <div className="flex flex-col gap-4">
      <div
        className="grid grid-cols-2 gap-3 sm:grid-cols-4"
        role="group"
        aria-label={t('history.filters.title')}
      >
        {select('position', POSITIONS, (o) => t(`positions.${o}`))}
        {select('verdict', VERDICTS, (o) => t(`verdict.${o}`))}
        {select('street', STREETS, (o) => t(`streets.${o}`))}
        {select('botLevel', BOT_LEVELS, (o) => t(`settings.difficulty.${o}`))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <p role="status" className="mr-auto text-sm" style={{ color: 'var(--color-muted)' }}>
          {t('history.count', { shown: shown.length, total: entries.value.length })}
        </p>
        <button
          type="button"
          className="btn btn-pill"
          disabled={shown.length === 0}
          onClick={() => {
            downloadText(
              `hand-history-${new Date().toISOString().slice(0, 10)}.txt`,
              formatHandsText(shown.map((e) => e.record)),
            );
          }}
        >
          {t('history.export')}
        </button>
        {confirmClear ? (
          <>
            <button
              type="button"
              className="btn btn-pill btn-danger"
              onClick={() => {
                setConfirmClear(false);
                void service.clear();
              }}
            >
              {t('history.clearConfirm')}
            </button>
            <button
              type="button"
              className="btn btn-pill"
              onClick={() => {
                setConfirmClear(false);
              }}
            >
              {t('history.clearCancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn btn-pill"
            onClick={() => {
              setConfirmClear(true);
            }}
          >
            {t('history.clear')}
          </button>
        )}
      </div>

      <ul className="flex flex-col gap-2">
        {shown.map((entry) => (
          <HandRow key={entry.record.id} entry={entry} locale={i18n.language} />
        ))}
      </ul>
    </div>
  );
}

function HandRow({
  entry,
  locale,
}: {
  readonly entry: HandEntry;
  readonly locale: string;
}): JSX.Element {
  const { t } = useTranslation();
  const { record, summary, analysis } = entry;
  const net = summary.heroNetBb;
  const handLabel = t('history.hand', { number: record.handNumber });
  const date = new Date(record.endedAt).toLocaleString(locale);
  const position = t(`positions.${summary.heroPosition}`);
  const result = t('history.result', { value: `${net > 0 ? '+' : ''}${net.toFixed(1)}` });
  let accuracy = t('history.noDecisions');
  if (analysis === null) accuracy = t('history.analysing');
  else if (summary.accuracy !== null) {
    accuracy = t('history.accuracy', { value: Math.round(summary.accuracy * 100) });
  }
  const labels = summary.labels.map((label) => t(`history.labels.${label}`));
  const parts = [handLabel, date, position, result, accuracy, ...labels];
  return (
    <li>
      <Link
        to={`/history/${encodeURIComponent(record.id)}`}
        // The visual row is a set of separate chips; the label reads them as one sentence.
        aria-label={parts.join(', ')}
        className="panel flex flex-wrap items-center gap-x-4 gap-y-2 p-4 hover:brightness-125"
      >
        <span className="font-extrabold">{handLabel}</span>
        <span className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {date}
        </span>
        <span className="chip">{position}</span>
        <span className="font-bold tabular-nums">
          <span aria-hidden="true">{net > 0 ? '▲ ' : net < 0 ? '▼ ' : '● '}</span>
          {result}
        </span>
        <span className="text-sm">{accuracy}</span>
        <span className="ml-auto flex flex-wrap gap-1">
          {labels.map((label) => (
            <span key={label} className="chip">
              {label}
            </span>
          ))}
        </span>
      </Link>
    </li>
  );
}
