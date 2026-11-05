import type { Suit } from '@/entities/card';

export interface ExampleCard {
  readonly rank: string;
  readonly suit: Suit;
  /** True for cards that form the combination; the rest are kickers and are dimmed. */
  readonly counts: boolean;
}

export interface HandRankingEntry {
  /** i18n key suffix under `handRankings.items`. */
  readonly id: string;
  readonly cards: readonly ExampleCard[];
}

const c = (rank: string, suit: Suit, counts = true): ExampleCard => ({ rank, suit, counts });

/** Strongest first, matching the engine's category order. */
export const HAND_RANKINGS: readonly HandRankingEntry[] = [
  {
    id: 'royalFlush',
    cards: [
      c('A', 'spades'),
      c('K', 'spades'),
      c('Q', 'spades'),
      c('J', 'spades'),
      c('10', 'spades'),
    ],
  },
  {
    id: 'straightFlush',
    cards: [
      c('9', 'hearts'),
      c('8', 'hearts'),
      c('7', 'hearts'),
      c('6', 'hearts'),
      c('5', 'hearts'),
    ],
  },
  {
    id: 'fourOfAKind',
    cards: [
      c('8', 'spades'),
      c('8', 'hearts'),
      c('8', 'diamonds'),
      c('8', 'clubs'),
      c('K', 'spades', false),
    ],
  },
  {
    id: 'fullHouse',
    cards: [
      c('Q', 'spades'),
      c('Q', 'hearts'),
      c('Q', 'diamonds'),
      c('7', 'clubs'),
      c('7', 'spades'),
    ],
  },
  {
    id: 'flush',
    cards: [
      c('A', 'diamonds'),
      c('J', 'diamonds'),
      c('8', 'diamonds'),
      c('6', 'diamonds'),
      c('3', 'diamonds'),
    ],
  },
  {
    id: 'straight',
    cards: [
      c('9', 'clubs'),
      c('8', 'diamonds'),
      c('7', 'spades'),
      c('6', 'hearts'),
      c('5', 'clubs'),
    ],
  },
  {
    id: 'threeOfAKind',
    cards: [
      c('10', 'spades'),
      c('10', 'hearts'),
      c('10', 'diamonds'),
      c('K', 'clubs', false),
      c('4', 'spades', false),
    ],
  },
  {
    id: 'twoPair',
    cards: [
      c('J', 'spades'),
      c('J', 'diamonds'),
      c('4', 'hearts'),
      c('4', 'clubs'),
      c('A', 'spades', false),
    ],
  },
  {
    id: 'pair',
    cards: [
      c('9', 'spades'),
      c('9', 'diamonds'),
      c('A', 'clubs', false),
      c('7', 'hearts', false),
      c('3', 'diamonds', false),
    ],
  },
  {
    id: 'highCard',
    cards: [
      c('A', 'spades'),
      c('J', 'diamonds', false),
      c('8', 'clubs', false),
      c('6', 'hearts', false),
      c('3', 'clubs', false),
    ],
  },
];
