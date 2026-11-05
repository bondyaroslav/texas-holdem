import { logger, type SoundCue, type SoundService, type SoundSettings } from '@/shared';
import type { AudioBackend } from './howler-backend.js';
import type { LocalSoundPreferences } from './local-sound-preferences.js';

/** The same cue twice within this window is one sound (e.g. a split pot paid in two events). */
const REPEAT_WINDOW_MS = 60;
const UNLOCK_EVENTS = ['pointerdown', 'keydown', 'touchstart'] as const;

interface GameSoundServiceDeps {
  readonly preferences: Pick<LocalSoundPreferences, 'load' | 'save'>;
  readonly loadBackend: () => Promise<AudioBackend>;
  /** Where the first user gesture is listened for; `window` in the browser. */
  readonly gestureTarget?: EventTarget | undefined;
  readonly now?: () => number;
}

/**
 * Sound for the game. Nothing is loaded until the first user gesture —
 * browsers block audio before it anyway — so cues raised earlier are dropped
 * rather than queued up and blasted all at once.
 */
export class GameSoundService implements SoundService {
  private settings: SoundSettings;
  private backend: AudioBackend | null = null;
  private loading = false;
  private readonly listeners = new Set<() => void>();
  private readonly lastPlayed = new Map<SoundCue, number>();
  private readonly deps: GameSoundServiceDeps;
  private readonly onGesture = (): void => {
    this.removeGestureListeners();
    void this.load();
  };

  constructor(deps: GameSoundServiceDeps) {
    this.deps = deps;
    this.settings = deps.preferences.load();
    for (const type of UNLOCK_EVENTS) {
      deps.gestureTarget?.addEventListener(type, this.onGesture, { passive: true });
    }
  }

  play(cue: SoundCue): void {
    if (!this.backend || !this.settings.enabled || this.settings.volume === 0) return;
    const now = (this.deps.now ?? Date.now)();
    const last = this.lastPlayed.get(cue);
    if (last !== undefined && now - last < REPEAT_WINDOW_MS) return;
    this.lastPlayed.set(cue, now);
    this.backend.play(cue);
  }

  getSettings(): SoundSettings {
    return this.settings;
  }

  setSettings(settings: SoundSettings): void {
    const volume = Math.max(0, Math.min(1, settings.volume));
    this.settings = { enabled: settings.enabled, volume };
    this.deps.preferences.save(this.settings);
    this.backend?.setVolume(volume);
    for (const listener of this.listeners) listener();
  }

  subscribe(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  dispose(): void {
    this.removeGestureListeners();
    this.listeners.clear();
  }

  private async load(): Promise<void> {
    if (this.backend || this.loading) return;
    this.loading = true;
    try {
      const backend = await this.deps.loadBackend();
      backend.setVolume(this.settings.volume);
      this.backend = backend;
    } catch (error) {
      // No sound is better than a broken game.
      logger.warn('Failed to initialise sound', { error });
    } finally {
      this.loading = false;
    }
  }

  private removeGestureListeners(): void {
    for (const type of UNLOCK_EVENTS) {
      this.deps.gestureTarget?.removeEventListener(type, this.onGesture);
    }
  }
}
