import type { Card } from '@poker/engine';
import { evaluateBestHand, HAND_CATEGORY_ORDER, rankValue } from '@poker/engine';

const SUITS = ['clubs', 'diamonds', 'hearts', 'spades'] as const;

export interface DrawInfo {
  readonly flushDraw: boolean;
  readonly straightDraw: 'open' | 'gutshot' | null;
  /** Cards that would complete a draw (rough, overlaps counted once). */
  readonly outs: number;
}

function rankMask(cards: readonly Card[]): number {
  let mask = 0;
  for (const card of cards) {
    const value = rankValue(card.rank);
    mask |= 1 << value;
    if (value === 14) mask |= 1 << 1; // the wheel's ace
  }
  return mask;
}

function hasStraight(mask: number): boolean {
  for (let high = 14; high >= 5; high--) {
    if (((mask >> (high - 4)) & 31) === 31) return true;
  }
  return false;
}

/** Flush and straight draws the hole cards take part in (flop and turn only). */
export function drawInfo(hole: readonly Card[], board: readonly Card[]): DrawInfo {
  if (board.length < 3 || board.length >= 5)
    return { flushDraw: false, straightDraw: null, outs: 0 };

  const flushDraw = SUITS.some((suit) => {
    const total = [...hole, ...board].filter((c) => c.suit === suit).length;
    return total === 4 && hole.some((c) => c.suit === suit);
  });

  const all = rankMask([...hole, ...board]);
  const boardOnly = rankMask(board);
  let completing = 0;
  if (!hasStraight(all)) {
    for (let value = 2; value <= 14; value++) {
      const bit = (1 << value) | (value === 14 ? 1 << 1 : 0);
      if ((all & (1 << value)) !== 0) continue;
      if (hasStraight(all | bit) && !hasStraight(boardOnly | bit)) completing++;
    }
  }
  const straightDraw = completing >= 2 ? 'open' : completing === 1 ? 'gutshot' : null;
  const straightOuts = straightDraw === 'open' ? 8 : straightDraw === 'gutshot' ? 4 : 0;
  const outs = flushDraw ? 9 + Math.max(0, straightOuts - 2) : straightOuts;
  return { flushDraw, straightDraw, outs };
}

/** 0 (dry, rainbow, disconnected) … 1 (monotone and connected): how many draws the board allows. */
export function boardWetness(board: readonly Card[]): number {
  if (board.length < 3) return 0;
  const maxSuit = Math.max(...SUITS.map((suit) => board.filter((c) => c.suit === suit).length));
  const values = [...new Set(board.map((c) => rankValue(c.rank)))].sort((a, b) => a - b);
  let connected = 0;
  for (const v of values) {
    connected = Math.max(connected, values.filter((w) => w >= v && w - v <= 4).length);
  }
  const suitScore = maxSuit >= 3 ? 0.55 : maxSuit === 2 ? 0.25 : 0;
  const connectScore = connected >= 3 ? 0.45 : connected === 2 ? 0.2 : 0;
  const paired = values.length < board.length ? -0.1 : 0;
  return Math.max(0, Math.min(1, suitScore + connectScore + paired));
}

/**
 * Rule-of-thumb heads-up equity of a made hand plus draws — what a decent
 * player estimates at the table without running the numbers (Medium).
 */
export function heuristicEquity(hole: readonly Card[], board: readonly Card[]): number {
  const [a, b] = hole;
  if (!a || !b || board.length < 3) return 0.5;
  const category = HAND_CATEGORY_ORDER[evaluateBestHand([...hole, ...board]).category];
  const boardValues = board.map((c) => rankValue(c.rank)).sort((x, y) => y - x);
  const top = boardValues[0] ?? 0;
  const holeValues = [rankValue(a.rank), rankValue(b.rank)];
  const boardCategory =
    board.length >= 5 ? HAND_CATEGORY_ORDER[evaluateBestHand(board).category] : 0;
  const pocketPair = holeValues[0] === holeValues[1];
  const pairsBoard = holeValues.filter((v) => boardValues.includes(v));

  let made: number;
  switch (category) {
    case 1:
      made = 0.1 + holeValues.filter((v) => v > top).length * 0.05;
      break;
    case 2:
      if (pocketPair && (holeValues[0] ?? 0) > top) made = 0.72;
      else if (pairsBoard.includes(top)) made = 0.6 + (Math.max(...holeValues) >= 12 ? 0.05 : 0);
      else if (pairsBoard.length > 0 || pocketPair) made = 0.42;
      else made = 0.15; // the pair is on the board
      break;
    case 3:
      made = pairsBoard.length === 2 ? 0.8 : pocketPair || pairsBoard.length === 1 ? 0.62 : 0.2;
      break;
    case 4:
      made = pocketPair ? 0.9 : pairsBoard.length > 0 ? 0.82 : 0.3;
      break;
    case 5:
      made = 0.86;
      break;
    case 6:
      made = 0.9;
      break;
    default:
      made = 0.97;
  }
  // Playing the board is a split at best.
  if (boardCategory >= category) made = Math.min(made, 0.25);

  const draws = drawInfo(hole, board);
  const perOut = board.length === 3 ? 0.035 : 0.02;
  return Math.min(0.97, Math.max(made, Math.min(0.55, made + draws.outs * perOut)));
}
