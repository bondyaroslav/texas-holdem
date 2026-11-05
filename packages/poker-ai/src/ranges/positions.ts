export type Position = 'utg' | 'mp' | 'hj' | 'co' | 'btn' | 'sb' | 'bb';

/**
 * Seat role from its distance to the button among the players dealt in
 * (0 = button, 1 = small blind, 2 = big blind, then under-the-gun onwards).
 * Heads-up the button is also the small blind and is reported as `btn`.
 */
export function positionOf(offsetFromButton: number, playerCount: number): Position {
  if (playerCount < 2 || offsetFromButton < 0 || offsetFromButton >= playerCount) {
    throw new RangeError(
      `Seat offset ${String(offsetFromButton)} is invalid for ${String(playerCount)} players`,
    );
  }
  if (offsetFromButton === 0) return 'btn';
  if (playerCount === 2) return 'bb';
  if (offsetFromButton === 1) return 'sb';
  if (offsetFromButton === 2) return 'bb';

  // Seats after the big blind, numbered from under-the-gun; the last is the cutoff.
  const preflopSeats = playerCount - 3;
  const index = offsetFromButton - 3;
  const fromEnd = preflopSeats - 1 - index;
  if (fromEnd === 0) return 'co';
  if (fromEnd === 1) return 'hj';
  return index === 0 ? 'utg' : 'mp';
}
