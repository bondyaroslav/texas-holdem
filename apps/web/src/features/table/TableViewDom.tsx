import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/entities/card';
import { PlayerSeat } from '@/entities/player';
import { Pot } from '@/entities/pot';
import type { TableViewProps } from './TableViewPixi.js';

/** Fallback renderer: no WebGL, reduced motion, tests. Same projection contract as `TableViewPixi`. */
export function TableViewDom({ snapshot }: TableViewProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <>
      <div className="flex flex-wrap justify-center gap-3">
        {snapshot.players.map((player, index) => (
          <PlayerSeat
            key={player.id}
            name={player.id === snapshot.viewerId ? t('table.you') : player.id}
            stack={player.stack}
            status={player.status}
            holeCards={player.holeCards}
            isDealer={index === snapshot.dealerIndex}
            isActing={player.id === snapshot.actingPlayerId}
            committedThisStreet={player.committedThisStreet}
          />
        ))}
      </div>

      <div className="flex gap-2" aria-label={t('table.communityCards')}>
        {snapshot.communityCards.map((card) => (
          <Card key={`${card.rank}-${card.suit}`} rank={card.rank} suit={card.suit} />
        ))}
      </div>

      <Pot amount={snapshot.pot} />
    </>
  );
}
