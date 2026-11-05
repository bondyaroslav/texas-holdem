import type { JSX } from 'react';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { formatPlayerName, TermLink, type HandEntry } from '@/shared';
import { DecisionList, type EquityView } from './DecisionList.js';
import { EquityChart } from './EquityChart.js';
import { HandReplay } from './HandReplay.js';
import { OutcomePanel } from './OutcomePanel.js';
import { buildTimeline, frameBeforeEvent } from './model/timeline.js';
import { useReplay } from './model/use-replay.js';

/**
 * The full review of one finished hand. Opponents' hidden cards are shown
 * here — the hand is over, and this view only exists for finished hands.
 */
export function HandReview({ entry }: { readonly entry: HandEntry }): JSX.Element {
  const { t, i18n } = useTranslation();
  const { record, analysis, summary } = entry;
  const frames = useMemo(() => buildTimeline(record), [record]);
  const controls = useReplay(frames);
  const [view, setView] = useState<EquityView>('range');
  const playerName = (id: string): string => formatPlayerName(id, record.heroId, t('table.you'));
  const allIn = analysis?.outcome?.allIn ?? null;
  const bigBlind = record.blinds.bigBlind;

  const showInReplay = (eventIndex: number): void => {
    controls.goTo(frameBeforeEvent(frames, eventIndex));
    // Focus scrolls the replayer into view and leaves keyboard users ready to step from there.
    document.getElementById('hand-replay-slider')?.focus();
  };

  return (
    <div className="flex flex-col gap-4">
      <section
        className="panel grid grid-cols-2 gap-4 sm:grid-cols-4"
        aria-label={t('review.summary.title')}
      >
        <div>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {t('review.summary.result')}
          </p>
          <p className="text-2xl font-black tabular-nums">
            {summary.heroNetBb > 0 ? '+' : ''}
            {summary.heroNetBb.toFixed(1)} bb
          </p>
        </div>
        <div>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            <TermLink term="accuracy">{t('review.summary.accuracy')}</TermLink>
          </p>
          <p className="text-2xl font-black tabular-nums">
            {summary.accuracy === null ? '—' : `${String(Math.round(summary.accuracy * 100))}%`}
          </p>
        </div>
        <div>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            {t('review.summary.position')}
          </p>
          <p className="text-2xl font-black">{t(`positions.${summary.heroPosition}`)}</p>
        </div>
        <div>
          <p className="text-sm" style={{ color: 'var(--color-muted)' }}>
            <TermLink term="allInEv">{t('review.summary.allInEv')}</TermLink>
          </p>
          <p className="text-lg font-bold tabular-nums">
            {allIn
              ? t('review.summary.allInValue', {
                  expected: (allIn.expectedNet / bigBlind).toFixed(1),
                  actual: (allIn.actualNet / bigBlind).toFixed(1),
                })
              : '—'}
          </p>
        </div>
        <p className="col-span-2 text-sm sm:col-span-4" style={{ color: 'var(--color-muted)' }}>
          {t('review.summary.meta', {
            number: record.handNumber,
            date: new Date(record.endedAt).toLocaleString(i18n.language),
            blinds: `${String(record.blinds.smallBlind)}/${String(record.blinds.bigBlind)}`,
          })}
        </p>
      </section>

      <div id="hand-replay" className="scroll-mt-4">
        <HandReplay controls={controls} playerName={playerName} />
      </div>

      {analysis ? (
        <>
          <EquityChart record={record} analysis={analysis} playerName={playerName} />
          <DecisionList
            decisions={analysis.decisions}
            bigBlind={bigBlind}
            view={view}
            onViewChange={setView}
            onShowInReplay={showInReplay}
            playerName={playerName}
          />
          {analysis.outcome ? (
            <OutcomePanel outcome={analysis.outcome} playerName={playerName} />
          ) : null}
        </>
      ) : (
        <p role="status" className="panel" style={{ color: 'var(--color-muted)' }}>
          {t('review.pending')}
        </p>
      )}
    </div>
  );
}
