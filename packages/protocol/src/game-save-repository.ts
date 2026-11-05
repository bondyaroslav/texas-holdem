import type { SavedGame } from './saved-game.js';

/**
 * Storage boundary for the game in progress, so a table survives reloads.
 * Local today (localStorage), server-backed later.
 */
export interface GameSaveRepository {
  /** Returns `null` when nothing is stored, or what's stored fails validation. */
  load(): SavedGame | null;
  save(game: SavedGame): void;
  clear(): void;
}
