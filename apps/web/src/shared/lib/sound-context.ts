import { createContext, useContext, useSyncExternalStore } from 'react';

/** Every sound the game can make; the table decides when, the service decides how. */
export type SoundCue =
  | 'deal'
  | 'flop'
  | 'board'
  | 'check'
  | 'chips'
  | 'allIn'
  | 'fold'
  | 'win'
  | 'potOther'
  | 'yourTurn';

export const SOUND_CUES: readonly SoundCue[] = [
  'deal',
  'flop',
  'board',
  'check',
  'chips',
  'allIn',
  'fold',
  'win',
  'potOther',
  'yourTurn',
];

export interface SoundSettings {
  readonly enabled: boolean;
  /** 0..1 */
  readonly volume: number;
}

/**
 * Sound output for the UI. The composition root picks the implementation;
 * components only ask for cues and read or change the settings.
 */
export interface SoundService {
  play(cue: SoundCue): void;
  /** Returns the same object until the settings change (safe for useSyncExternalStore). */
  getSettings(): SoundSettings;
  setSettings(settings: SoundSettings): void;
  subscribe(listener: () => void): () => void;
}

const SILENT_SETTINGS: SoundSettings = { enabled: false, volume: 0 };

/** Default for trees without a provider (tests, isolated components): never makes a sound. */
export const silentSoundService: SoundService = {
  play: () => undefined,
  getSettings: () => SILENT_SETTINGS,
  setSettings: () => undefined,
  subscribe: () => () => undefined,
};

export const SoundContext = createContext<SoundService>(silentSoundService);

export function useSound(): SoundService {
  return useContext(SoundContext);
}

export function useSoundSettings(): SoundSettings {
  const service = useSound();
  return useSyncExternalStore(
    (listener) => service.subscribe(listener),
    () => service.getSettings(),
  );
}
