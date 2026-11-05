import { afterEach, describe, expect, it, vi } from 'vitest';
import { SOUND_CUES, type SoundCue } from '@/shared';
import {
  DEFAULT_SOUND_SETTINGS,
  encodeWav,
  GameSoundService,
  LocalSoundPreferences,
  SYNTH_SAMPLE_RATE,
  synthesizeCue,
  toWavDataUri,
  type AudioBackend,
} from '@/infrastructure/audio';

afterEach(() => {
  localStorage.clear();
});

describe('synthesizeCue', () => {
  it.each(SOUND_CUES)('%s is short, audible and never clips', (cue) => {
    const samples = synthesizeCue(cue);
    const seconds = samples.length / SYNTH_SAMPLE_RATE;
    const peak = samples.reduce((max, s) => Math.max(max, Math.abs(s)), 0);
    expect(seconds).toBeGreaterThan(0.1);
    expect(seconds).toBeLessThanOrEqual(1.5);
    expect(peak).toBeGreaterThan(0.3);
    // Faded tail: no click when the sound stops.
    expect(Math.abs(samples.at(-1) ?? 1)).toBeLessThan(1e-3);
    expect(peak).toBeLessThanOrEqual(0.8 + 1e-6);
    expect(samples.every(Number.isFinite)).toBe(true);
  });

  it('is deterministic', () => {
    expect(synthesizeCue('allIn')).toEqual(synthesizeCue('allIn'));
  });
});

describe('encodeWav', () => {
  it('writes a 16-bit mono PCM header and clamps samples', () => {
    const bytes = encodeWav(new Float32Array([0, 1, -1, 2]), 22_050);
    const view = new DataView(bytes.buffer);
    const ascii = (offset: number): string =>
      String.fromCharCode(...bytes.subarray(offset, offset + 4));
    expect(ascii(0)).toBe('RIFF');
    expect(ascii(8)).toBe('WAVE');
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(22_050);
    expect(view.getUint16(34, true)).toBe(16);
    expect(view.getUint32(40, true)).toBe(8);
    expect(view.getInt16(46, true)).toBe(0x7fff);
    expect(view.getInt16(48, true)).toBe(-0x7fff);
    expect(view.getInt16(50, true)).toBe(0x7fff);
    expect(toWavDataUri(bytes)).toMatch(/^data:audio\/wav;base64,UklGR/);
  });
});

describe('LocalSoundPreferences', () => {
  it('defaults, round-trips and ignores corrupted data', () => {
    const preferences = new LocalSoundPreferences();
    expect(preferences.load()).toEqual(DEFAULT_SOUND_SETTINGS);
    preferences.save({ enabled: false, volume: 0.25 });
    expect(preferences.load()).toEqual({ enabled: false, volume: 0.25 });
    localStorage.setItem('texas-holdem:sound', '{"enabled":"yes"}');
    expect(preferences.load()).toEqual(DEFAULT_SOUND_SETTINGS);
  });
});

function setup(): {
  service: GameSoundService;
  played: SoundCue[];
  backend: AudioBackend & { volume: number };
  target: EventTarget;
  clock: { now: number };
} {
  const played: SoundCue[] = [];
  const backend = {
    volume: -1,
    play: (cue: SoundCue) => played.push(cue),
    setVolume(volume: number) {
      backend.volume = volume;
    },
  };
  const target = new EventTarget();
  const clock = { now: 0 };
  const service = new GameSoundService({
    preferences: new LocalSoundPreferences(),
    loadBackend: () => Promise.resolve(backend),
    gestureTarget: target,
    now: () => clock.now,
  });
  return { service, played, backend, target, clock };
}

describe('GameSoundService', () => {
  it('stays silent until the first user gesture', async () => {
    const { service, played, target, backend } = setup();
    service.play('chips');
    expect(played).toEqual([]);

    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => {
      expect(backend.volume).toBe(DEFAULT_SOUND_SETTINGS.volume);
    });
    service.play('chips');
    expect(played).toEqual(['chips']);
  });

  it('respects the switch and volume, persists them and notifies subscribers', async () => {
    const { service, played, target, backend, clock } = setup();
    target.dispatchEvent(new Event('keydown'));
    await vi.waitFor(() => {
      expect(backend.volume).toBeGreaterThanOrEqual(0);
    });
    const listener = vi.fn();
    service.subscribe(listener);

    service.setSettings({ enabled: false, volume: 0.3 });
    service.play('fold');
    expect(played).toEqual([]);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(new LocalSoundPreferences().load()).toEqual({ enabled: false, volume: 0.3 });

    service.setSettings({ enabled: true, volume: 1.7 });
    expect(service.getSettings().volume).toBe(1);
    expect(backend.volume).toBe(1);
    clock.now = 1000;
    service.play('fold');
    expect(played).toEqual(['fold']);
  });

  it('merges the same cue fired twice at once', async () => {
    const { service, played, target, backend, clock } = setup();
    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => {
      expect(backend.volume).toBeGreaterThanOrEqual(0);
    });
    service.play('potOther');
    service.play('potOther');
    service.play('win');
    clock.now = 500;
    service.play('potOther');
    expect(played).toEqual(['potOther', 'win', 'potOther']);
  });

  it('keeps the game running when audio fails to load', async () => {
    const target = new EventTarget();
    const loadBackend = vi.fn(() => Promise.reject(new Error('no audio')));
    const service = new GameSoundService({
      preferences: new LocalSoundPreferences(),
      loadBackend,
      gestureTarget: target,
    });
    target.dispatchEvent(new Event('pointerdown'));
    await vi.waitFor(() => {
      expect(loadBackend).toHaveBeenCalledOnce();
    });
    expect(() => {
      service.play('deal');
    }).not.toThrow();
  });
});
