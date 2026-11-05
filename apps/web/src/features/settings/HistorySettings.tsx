import type { JSX } from 'react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useHandHistoryService } from '@/shared';

const LIMIT_OPTIONS = [100, 500, 1000, 5000] as const;

/** How many finished hands to keep, and a way to wipe them. */
export function HistorySettings(): JSX.Element {
  const { t } = useTranslation();
  const service = useHandHistoryService();
  const [limit, setLimit] = useState(() => service.getMaxHands());
  const [confirming, setConfirming] = useState(false);
  const [cleared, setCleared] = useState(false);

  return (
    <section className="panel mt-4 flex flex-col gap-4" aria-labelledby="history-settings">
      <h2 id="history-settings" className="text-xl font-extrabold">
        {t('settings.history.title')}
      </h2>
      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {t('settings.history.limit')}
        <select
          className="field"
          value={limit}
          onChange={(event) => {
            const value = Number(event.target.value);
            setLimit(value);
            service.setMaxHands(value);
          }}
        >
          {[...new Set([...LIMIT_OPTIONS, limit])]
            .sort((a, b) => a - b)
            .map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
        </select>
        <span className="font-normal" style={{ color: 'var(--color-muted)' }}>
          {t('settings.history.limitHint')}
        </span>
      </label>
      <div className="flex flex-wrap items-center gap-2">
        {confirming ? (
          <>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                setConfirming(false);
                void service.clear().then(() => {
                  setCleared(true);
                });
              }}
            >
              {t('history.clearConfirm')}
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setConfirming(false);
              }}
            >
              {t('history.clearCancel')}
            </button>
          </>
        ) : (
          <button
            type="button"
            className="btn"
            onClick={() => {
              setCleared(false);
              setConfirming(true);
            }}
          >
            {t('history.clear')}
          </button>
        )}
        <span role="status">{cleared ? t('settings.history.cleared') : null}</span>
      </div>
    </section>
  );
}
