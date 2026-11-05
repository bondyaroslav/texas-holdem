import { SOUND_CUES, type SoundCue } from '@/shared';
import { encodeWav, toWavDataUri } from './wav.js';
import { SYNTH_SAMPLE_RATE, synthesizeCue } from './synth.js';

/** What the sound service needs from an audio library — a seam so tests run without audio. */
export interface AudioBackend {
  play(cue: SoundCue): void;
  setVolume(volume: number): void;
}

/**
 * Howler.js backend. Howler is imported lazily so it (and the synthesis work)
 * stays out of the main chunk and only runs after the first user gesture.
 */
export async function createHowlerBackend(): Promise<AudioBackend> {
  const { Howl, Howler } = await import('howler');
  const sounds = new Map(
    SOUND_CUES.map((cue) => {
      const src = toWavDataUri(encodeWav(synthesizeCue(cue), SYNTH_SAMPLE_RATE));
      return [cue, new Howl({ src: [src], format: ['wav'], preload: true })] as const;
    }),
  );
  return {
    play(cue) {
      sounds.get(cue)?.play();
    },
    setVolume(volume) {
      Howler.volume(volume);
    },
  };
}
