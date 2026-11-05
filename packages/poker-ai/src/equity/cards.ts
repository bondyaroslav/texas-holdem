import { createDeck, type Card } from '@poker/engine';
import type { EquityInput, Participant } from './types.js';

export const DECK: readonly Card[] = createDeck();

const INDEX_BY_KEY = new Map(DECK.map((c, i) => [cardKey(c), i] as const));

export function cardKey(card: Card): string {
  return `${card.rank}${card.suit[0] ?? ''}`;
}

export function cardIndex(card: Card): number {
  const index = INDEX_BY_KEY.get(cardKey(card));
  if (index === undefined) {
    throw new RangeError(`Unknown card ${cardKey(card)}`);
  }
  return index;
}

export function cardAt(index: number): Card {
  const card = DECK[index];
  if (!card) {
    throw new RangeError(`Card index out of range: ${String(index)}`);
  }
  return card;
}

/** Cards that every sampled outcome must avoid: known hands, board, dead cards. */
export function fixedCardIndexes(input: EquityInput): Set<number> {
  const used = new Set<number>();
  const take = (card: Card): void => {
    const index = cardIndex(card);
    if (used.has(index)) {
      throw new RangeError(`Duplicate card ${cardKey(card)}`);
    }
    used.add(index);
  };
  for (const card of input.board) take(card);
  for (const card of input.dead ?? []) take(card);
  for (const p of input.participants) {
    if (p.kind === 'hand') {
      for (const card of p.cards) take(card);
    }
  }
  return used;
}

export function validateInput(input: EquityInput): void {
  if (input.participants.length < 2) {
    throw new RangeError('Equity needs at least two participants');
  }
  if (![0, 3, 4, 5].includes(input.board.length)) {
    throw new RangeError(`Board must have 0, 3, 4 or 5 cards, got ${String(input.board.length)}`);
  }
  for (const p of input.participants) {
    if (p.kind === 'range' && p.combos.length === 0) {
      throw new RangeError('A range must contain at least one combo');
    }
  }
}

export function allHands(participants: readonly Participant[]): boolean {
  return participants.every((p) => p.kind === 'hand');
}
