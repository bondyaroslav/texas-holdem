import type { JSX } from 'react';
import { Card, HiddenCard, type CardProps } from '@/entities/card';

export type SeatStatus = 'active' | 'folded' | 'allIn' | 'sittingOut';

export interface PlayerSeatProps {
  readonly name: string;
  readonly stack: number;
  readonly status: SeatStatus;
  readonly holeCards: readonly CardProps[] | null;
  readonly isDealer: boolean;
  readonly isActing: boolean;
  readonly committedThisStreet: number;
}

function HoleCards({
  holeCards,
  status,
}: Pick<PlayerSeatProps, 'holeCards' | 'status'>): JSX.Element | null {
  if (holeCards) {
    return (
      <>
        {holeCards.map((card) => (
          <Card key={`${card.rank}-${card.suit}`} rank={card.rank} suit={card.suit} />
        ))}
      </>
    );
  }
  if (status === 'sittingOut') {
    return null;
  }
  return (
    <>
      <HiddenCard />
      <HiddenCard />
    </>
  );
}

export function PlayerSeat({
  name,
  stack,
  status,
  holeCards,
  isDealer,
  isActing,
  committedThisStreet,
}: PlayerSeatProps): JSX.Element {
  return (
    <div
      className={`flex flex-col items-center gap-1 rounded-lg border p-2 transition-colors ${
        isActing ? 'border-amber-400 ring-2 ring-amber-400' : 'border-white/10'
      } ${status === 'folded' ? 'opacity-40' : ''}`}
    >
      <div className="flex items-center gap-1 text-sm font-medium">
        {isDealer ? <span aria-label="dealer button">🔘</span> : null}
        <span>{name}</span>
      </div>
      <div className="flex gap-1">
        <HoleCards holeCards={holeCards} status={status} />
      </div>
      <div className="text-xs tabular-nums">{stack}</div>
      {committedThisStreet > 0 ? (
        <div className="text-xs tabular-nums text-amber-300">{committedThisStreet}</div>
      ) : null}
      <div className="text-[10px] uppercase tracking-wide opacity-70">{status}</div>
    </div>
  );
}
