import type { JSX } from 'react';

export type Suit = 'clubs' | 'diamonds' | 'hearts' | 'spades';

export interface CardProps {
  readonly rank: string;
  readonly suit: Suit;
}

const SUIT_SYMBOLS: Readonly<Record<Suit, string>> = {
  clubs: '♣',
  diamonds: '♦',
  hearts: '♥',
  spades: '♠',
};

const RED_SUITS: ReadonlySet<Suit> = new Set(['diamonds', 'hearts']);

export function Card({ rank, suit }: CardProps): JSX.Element {
  const isRed = RED_SUITS.has(suit);

  return (
    <span
      className={`inline-flex h-14 w-10 items-center justify-center rounded border border-black/20 bg-white text-sm font-semibold ${
        isRed ? 'text-red-600' : 'text-slate-900'
      }`}
      aria-label={`${rank} of ${suit}`}
    >
      {rank}
      {SUIT_SYMBOLS[suit]}
    </span>
  );
}

export function HiddenCard(): JSX.Element {
  return (
    <span
      className="inline-flex h-14 w-10 items-center justify-center rounded border border-black/20 bg-slate-700"
      aria-hidden="true"
    />
  );
}
