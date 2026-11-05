import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ProjectedState } from '@poker/protocol';
import { TableScene } from './pixi/table-scene.js';

export interface TableViewProps {
  readonly snapshot: ProjectedState;
}

/**
 * WebGL table renderer. Owns the Pixi lifecycle only: mount, feed snapshots,
 * pause when the tab is hidden, destroy on unmount. All drawing lives in
 * `TableScene`; controls/modals stay in HTML around the canvas.
 */
export function TableViewPixi({ snapshot }: TableViewProps): JSX.Element {
  const { t } = useTranslation();
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<TableScene | null>(null);

  const labels = {
    pot: t('table.pot'),
    you: t('table.you'),
    allIn: t('table.status.allIn'),
    fold: t('table.status.fold'),
    title: t('app.name'),
  };
  const { pot, you, allIn, fold, title } = labels;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const scene = new TableScene({ pot, you, allIn, fold, title });
    sceneRef.current = scene;
    scene.update(snapshot);
    void scene.init(host);

    const onVisibility = (): void => {
      scene.setPaused(document.hidden);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      sceneRef.current = null;
      scene.destroy();
    };
    // Mount once: later snapshot/label changes are pushed by the effects below.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally mount-only
  }, []);

  useEffect(() => {
    sceneRef.current?.update(snapshot);
  }, [snapshot]);

  useEffect(() => {
    sceneRef.current?.setLabels({ pot, you, allIn, fold, title });
  }, [pot, you, allIn, fold, title]);

  const summary = `${labels.pot}: ${String(snapshot.pot)}. ${snapshot.communityCards
    .map((c) => `${c.rank}${c.suit[0] ?? ''}`)
    .join(' ')}`;

  return (
    <div
      ref={hostRef}
      role="img"
      aria-label={summary}
      className="relative h-[min(58vh,720px)] min-h-[360px] w-full overflow-hidden rounded-2xl"
    />
  );
}
