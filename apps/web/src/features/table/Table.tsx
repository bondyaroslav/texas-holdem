import { lazy, Suspense, useEffect, useState } from 'react';
import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { useGameGateway } from '@/shared';
import { BettingControls } from '@/features/betting-controls';
import { useSettingsStore } from '@/features/settings';
import { TableViewDom } from './TableViewDom.js';
import { canUsePixi } from './use-pixi-support.js';
import { useTableStore } from './model/table-store.js';
import { useTableSounds } from './use-table-sounds.js';
import { formatPlayerName, gameOutcome, summarizeLastHand } from './model/hand-result.js';
import {
  selectError,
  selectIsHandInProgress,
  selectIsLocalPlayersTurn,
  selectLocalPlayer,
  selectSnapshot,
  selectStatus,
  selectToCall,
} from './model/selectors.js';

// Pixi is a lazy chunk so the lobby/settings never pay for WebGL code.
const TableViewPixi = lazy(() =>
  import('./TableViewPixi.js').then((m) => ({ default: m.TableViewPixi })),
);

export function Table(): JSX.Element {
  const { t } = useTranslation();
  const gateway = useGameGateway();
  const [usePixi] = useState(canUsePixi);
  const tableConfig = useSettingsStore((state) => state.config);

  const snapshot = useTableStore(selectSnapshot);
  const displaySnapshot = useTableStore((state) => state.displaySnapshot);
  const status = useTableStore(selectStatus);
  const error = useTableStore(selectError);
  const log = useTableStore((state) => state.log);
  const localPlayer = useTableStore(selectLocalPlayer);
  const isLocalPlayersTurn = useTableStore(selectIsLocalPlayersTurn);
  const isHandInProgress = useTableStore(selectIsHandInProgress);
  const toCall = useTableStore(selectToCall);
  const connect = useTableStore((state) => state.connect);
  const ensureConnected = useTableStore((state) => state.ensureConnected);
  const startHand = useTableStore((state) => state.startHand);
  const submitAction = useTableStore((state) => state.submitAction);

  useTableSounds();

  useEffect(() => {
    void ensureConnected(gateway, tableConfig);
  }, [ensureConnected, gateway, tableConfig]);

  if (status === 'connecting' || !snapshot) {
    return (
      <p className="py-20 text-center" style={{ color: 'var(--color-muted)' }}>
        {t('table.connecting')}
      </p>
    );
  }

  const viewerId = snapshot.viewerId;
  const outcome = gameOutcome(snapshot);
  const result = summarizeLastHand(log, viewerId);
  const names = (result?.winners ?? [])
    .map((w) => formatPlayerName(w.playerId, viewerId, t('table.you')))
    .join(', ');
  const topAmount = result?.winners[0]?.amount ?? 0;
  let resultText = '';
  if (result) {
    if (result.localAmount > 0) {
      resultText = t('table.result.won', { amount: result.localAmount });
    } else if (result.winners.length > 0) {
      const key = localPlayer && localPlayer.status !== 'folded' ? 'lost' : 'other';
      resultText = t(`table.result.${key}`, { names, amount: topAmount });
    }
  }
  const gameOverTitle = t(outcome === 'won' ? 'table.gameOver.champion' : 'table.gameOver.busted');
  const gameOverText = t(
    outcome === 'won' ? 'table.gameOver.championText' : 'table.gameOver.bustedText',
  );

  return (
    <section className="flex flex-col items-center gap-4">
      {error ? (
        <p role="alert" className="rounded-xl bg-red-950/60 px-4 py-2 text-sm text-red-300">
          {error}
        </p>
      ) : null}

      {usePixi ? (
        <Suspense fallback={<p>{t('table.connecting')}</p>}>
          <TableViewPixi snapshot={displaySnapshot ?? snapshot} />
        </Suspense>
      ) : (
        <TableViewDom snapshot={displaySnapshot ?? snapshot} />
      )}

      {!isHandInProgress ? (
        <>
          {result ? (
            <p
              role="status"
              className="panel px-6 py-3 text-center text-lg font-bold"
              style={{ color: result.localAmount > 0 ? 'var(--color-accent)' : undefined }}
            >
              {resultText}
            </p>
          ) : null}
          {outcome === 'playing' ? (
            <button
              type="button"
              className="btn btn-primary btn-lg"
              onClick={() => void startHand()}
            >
              {t('table.startHand')}
            </button>
          ) : (
            <div role="alertdialog" aria-label={gameOverTitle} className="panel text-center">
              <h2 className="text-2xl font-black">{gameOverTitle}</h2>
              <p className="mt-1 mb-4" style={{ color: 'var(--color-muted)' }}>
                {gameOverText}
              </p>
              <button
                type="button"
                className="btn btn-primary btn-lg"
                onClick={() => void connect(gateway, tableConfig)}
              >
                {t('table.gameOver.newGame')}
              </button>
            </div>
          )}
        </>
      ) : null}

      {isHandInProgress && !isLocalPlayersTurn ? (
        <p role="status" className="text-sm" style={{ color: 'var(--color-muted)' }}>
          {t('table.waiting')}
        </p>
      ) : null}

      {isLocalPlayersTurn && localPlayer ? (
        <BettingControls
          toCall={toCall}
          currentBet={snapshot.currentBet}
          minRaise={snapshot.minRaise}
          bigBlind={snapshot.blinds.bigBlind}
          stack={localPlayer.stack}
          committedThisStreet={localPlayer.committedThisStreet}
          pot={snapshot.pot}
          onAction={(action) => void submitAction(action)}
        />
      ) : null}
    </section>
  );
}
