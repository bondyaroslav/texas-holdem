import { z } from 'zod';
import type { Chips, PlayerId } from '@poker/engine';

// Brands are erased at runtime; the schema has already checked the value is a
// non-negative integer / string, so narrowing here is sound.
export const chips = z
  .number()
  .int()
  .nonnegative()
  .transform((value) => value as Chips);
export const playerId = z.string().transform((value) => value as PlayerId);

export const card = z.object({
  rank: z.enum(['2', '3', '4', '5', '6', '7', '8', '9', 'T', 'J', 'Q', 'K', 'A']),
  suit: z.enum(['clubs', 'diamonds', 'hearts', 'spades']),
});

export const street = z.enum(['idle', 'preflop', 'flop', 'turn', 'river', 'showdown']);
