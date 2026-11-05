import type { JSX, KeyboardEvent } from 'react';
import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/entities/card';
import { formatMessage } from './model/format-message.js';
import type { ReplayControls } from './model/use-replay.js';

export interface HandReplayProps {
  readonly controls: ReplayControls;
  readonly playerName: (id: string) => string;
}

/**
 * Step-by-step replayer. ←/→ step, PageUp/PageDown (or Shift+←/→) jump a
 * street, Home/End go to the deal / the result; the current step is announced
 * politely to screen readers.
 */
export function HandReplay({ controls, playerName }: HandReplayProps): JSX.Element {
  const { t } = useTranslation();
  const headingId = useId();
  const frame = controls.frame;
  const message = frame ? formatMessage(frame.message, t, playerName) : '';

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const handlers: Record<string, (() => void) | undefined> = {
      ArrowRight: event.shiftKey ? controls.nextStreet : controls.next,
      ArrowLeft: event.shiftKey ? controls.previousStreet : controls.previous,
      PageDown: controls.nextStreet,
      PageUp: controls.previousStreet,
      Home: controls.first,
      End: controls.last,
    };
    const handler = handlers[event.key];
    if (handler) {
      event.preventDefault();
      handler();
    }
  };

  const buttons = [
    {
      label: t('review.replay.first'),
      icon: '⏮',
      onClick: controls.first,
      keys: 'Home',
      disabled: controls.index === 0,
    },
    {
      label: t('review.replay.previousStreet'),
      icon: '⏪',
      onClick: controls.previousStreet,
      keys: 'PageUp',
      disabled: controls.index === 0,
    },
    {
      label: t('review.replay.previous'),
      icon: '◀',
      onClick: controls.previous,
      keys: 'ArrowLeft',
      disabled: controls.index === 0,
    },
    {
      label: t('review.replay.next'),
      icon: '▶',
      onClick: controls.next,
      keys: 'ArrowRight',
      disabled: controls.index >= controls.count - 1,
    },
    {
      label: t('review.replay.nextStreet'),
      icon: '⏩',
      onClick: controls.nextStreet,
      keys: 'PageDown',
      disabled: controls.index >= controls.count - 1,
    },
    {
      label: t('review.replay.last'),
      icon: '⏭',
      onClick: controls.last,
      keys: 'End',
      disabled: controls.index >= controls.count - 1,
    },
  ];

  return (
    <section aria-labelledby={headingId} className="panel flex flex-col gap-4">
      <h2 id={headingId} className="text-xl font-extrabold">
        {t('review.replay.title')}
      </h2>

      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {buttons.map((b) => (
            <button
              key={b.keys}
              type="button"
              className="btn btn-pill"
              aria-label={b.label}
              title={b.label}
              aria-keyshortcuts={b.keys}
              disabled={b.disabled}
              onClick={b.onClick}
            >
              <span aria-hidden="true">{b.icon}</span>
            </button>
          ))}
        </div>

        {/* The steps of a hand behave like a slider: ←/→, PageUp/PageDown, Home/End. */}
        <div
          id="hand-replay-slider"
          className="replay rounded-xl border p-3"
          style={{ borderColor: 'var(--color-border)' }}
          tabIndex={0}
          role="slider"
          aria-label={t('review.replay.sliderLabel')}
          aria-valuemin={1}
          aria-valuemax={Math.max(controls.count, 1)}
          aria-valuenow={controls.index + 1}
          aria-valuetext={`${t('review.replay.step', { n: controls.index + 1, count: controls.count })}: ${message}`}
          aria-keyshortcuts="ArrowLeft ArrowRight PageUp PageDown Home End"
          onKeyDown={onKeyDown}
        >
          <p className="text-sm tabular-nums" style={{ color: 'var(--color-muted)' }}>
            {t('review.replay.step', { n: controls.index + 1, count: controls.count })}
          </p>
          <p className="min-h-6 font-semibold">{message}</p>
        </div>

        {frame ? (
          <>
            <div className="flex flex-wrap items-center gap-4">
              <div className="flex gap-1" aria-label={t('table.communityCards')} role="group">
                {frame.board.length === 0 ? (
                  <span style={{ color: 'var(--color-muted)' }}>{t('review.replay.noBoard')}</span>
                ) : (
                  frame.board.map((c) => (
                    <Card key={`${c.rank}${c.suit}`} rank={c.rank} suit={c.suit} />
                  ))
                )}
              </div>
              <p className="font-bold">
                {t('table.pot')}: <span className="tabular-nums">{frame.pot}</span>
              </p>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-120 text-left text-sm">
                <caption className="sr-only">{t('review.replay.tableCaption')}</caption>
                <thead style={{ color: 'var(--color-muted)' }}>
                  <tr>
                    <th scope="col" className="py-1 pr-3">
                      {t('review.replay.player')}
                    </th>
                    <th scope="col" className="py-1 pr-3">
                      {t('review.replay.cards')}
                    </th>
                    <th scope="col" className="py-1 pr-3">
                      {t('review.replay.stack')}
                    </th>
                    <th scope="col" className="py-1 pr-3">
                      {t('review.replay.bet')}
                    </th>
                    <th scope="col" className="py-1 pr-3">
                      {t('review.replay.lastAction')}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {frame.players.map((p) => (
                    <tr
                      key={p.id}
                      className={p.folded ? 'opacity-50' : undefined}
                      aria-current={frame.actorId === p.id ? 'step' : undefined}
                    >
                      <th scope="row" className="py-1.5 pr-3 font-semibold">
                        {frame.actorId === p.id ? <span aria-hidden="true">▸ </span> : null}
                        {playerName(p.id)}
                      </th>
                      <td className="py-1.5 pr-3">
                        <span className="flex gap-1">
                          {p.holeCards.map((c) => (
                            <Card key={`${c.rank}${c.suit}`} rank={c.rank} suit={c.suit} />
                          ))}
                        </span>
                      </td>
                      <td className="py-1.5 pr-3 tabular-nums">{p.stack}</td>
                      <td className="py-1.5 pr-3 tabular-nums">
                        {p.streetBet > 0 ? p.streetBet : '—'}
                      </td>
                      <td className="py-1.5 pr-3">
                        {[
                          p.lastAction ? t(`review.action.${p.lastAction}`) : null,
                          p.folded ? t('table.status.fold') : null,
                          p.allIn ? t('table.status.allIn') : null,
                          p.won > 0 ? t('review.replay.won', { amount: p.won }) : null,
                        ]
                          .filter((v, i, all): v is string => v !== null && all.indexOf(v) === i)
                          .join(' · ') || '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        ) : null}
      </div>
      <p className="text-xs" style={{ color: 'var(--color-muted)' }}>
        {t('review.replay.keyboardHint')}
      </p>
    </section>
  );
}
