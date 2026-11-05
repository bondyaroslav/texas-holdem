import { createMulberry32, type Rng } from '@poker/engine';
import type { SoundCue } from '@/shared';

/**
 * Procedural sound effects: every cue is synthesized from filtered noise and
 * tones, so the game ships its own sounds with no third-party audio assets.
 * Seeded noise keeps each cue identical between runs.
 *
 * The recipes imitate the physical source: a card is a paper "fwip" (noise
 * through a band-pass sweeping upwards) ending in a soft slap on felt; a chip
 * is a handful of inharmonic clay modes that die out in milliseconds. A small
 * room reverb glues everything so nothing sounds like a dry beep.
 */
export const SYNTH_SAMPLE_RATE = 44_100;
const SR = SYNTH_SAMPLE_RATE;

/** RBJ biquad, recomputed per sample so the centre frequency can sweep. */
class Biquad {
  private x1 = 0;
  private x2 = 0;
  private y1 = 0;
  private y2 = 0;

  constructor(private readonly kind: 'bandpass' | 'lowpass' | 'highpass') {}

  process(x: number, freq: number, q: number): number {
    const w0 = (2 * Math.PI * Math.min(freq, SR * 0.45)) / SR;
    const cos = Math.cos(w0);
    const alpha = Math.sin(w0) / (2 * q);
    let b0: number;
    let b1: number;
    let b2: number;
    switch (this.kind) {
      case 'bandpass':
        b0 = alpha;
        b1 = 0;
        b2 = -alpha;
        break;
      case 'lowpass':
        b0 = (1 - cos) / 2;
        b1 = 1 - cos;
        b2 = b0;
        break;
      case 'highpass':
        b0 = (1 + cos) / 2;
        b1 = -(1 + cos);
        b2 = b0;
        break;
    }
    const a0 = 1 + alpha;
    const y =
      (b0 * x + b1 * this.x1 + b2 * this.x2 + 2 * cos * this.y1 - (1 - alpha) * this.y2) / a0;
    this.x2 = this.x1;
    this.x1 = x;
    this.y2 = this.y1;
    this.y1 = y;
    return y;
  }
}

interface NoiseOptions {
  readonly at: number;
  readonly length: number;
  readonly gain: number;
  readonly filter: 'bandpass' | 'lowpass' | 'highpass';
  /** Filter frequency at the start and end of the burst (exponential glide). */
  readonly freq: number;
  readonly freqEnd?: number;
  readonly q?: number;
  /** Envelope: smooth rise over `attack`, then exponential fall with time constant `decay`. */
  readonly attack: number;
  readonly decay: number;
}

interface ToneOptions {
  readonly at: number;
  readonly freq: number;
  readonly gain: number;
  readonly decay: number;
  readonly attack?: number;
  readonly freqEnd?: number;
}

class Track {
  readonly samples: Float32Array;

  constructor(seconds: number) {
    this.samples = new Float32Array(Math.round(seconds * SR));
  }

  noise(rng: Rng, o: NoiseOptions): this {
    const filter = new Biquad(o.filter);
    const start = Math.round(o.at * SR);
    const count = Math.round(o.length * SR);
    const freqEnd = o.freqEnd ?? o.freq;
    for (let i = 0; i < count; i++) {
      const t = i / SR;
      const freq = o.freq * Math.pow(freqEnd / o.freq, i / count);
      const filtered = filter.process(rng.next() * 2 - 1, freq, o.q ?? 0.8);
      this.add(start + i, filtered * envelope(t, o.attack, o.decay, o.length) * o.gain);
    }
    return this;
  }

  tone(o: ToneOptions): this {
    const start = Math.round(o.at * SR);
    const count = Math.round(o.decay * 7 * SR);
    const attack = o.attack ?? 0.002;
    const freqEnd = o.freqEnd ?? o.freq;
    let phase = 0;
    for (let i = 0; i < count; i++) {
      const t = i / SR;
      phase += (2 * Math.PI * (o.freq + (freqEnd - o.freq) * (i / count))) / SR;
      this.add(start + i, Math.sin(phase) * envelope(t, attack, o.decay, o.decay * 7) * o.gain);
    }
    return this;
  }

  /** Paper sliding: band-limited noise whose brightness glides. */
  slide(rng: Rng, at: number, length: number, from: number, to: number, gain: number): this {
    return this.noise(rng, {
      at,
      length,
      gain,
      filter: 'bandpass',
      freq: from,
      freqEnd: to,
      q: 0.9,
      attack: length * 0.6,
      decay: length * 0.25,
    });
  }

  /** A card landing flat on felt: a dull papery slap with a little body. */
  slap(rng: Rng, at: number, gain: number): this {
    return this.noise(rng, {
      at,
      length: 0.05,
      gain,
      filter: 'bandpass',
      freq: 1700,
      q: 0.7,
      attack: 0.0008,
      decay: 0.007,
    })
      .noise(rng, {
        at,
        length: 0.05,
        gain: gain * 0.8,
        filter: 'lowpass',
        freq: 450,
        attack: 0.001,
        decay: 0.012,
      })
      .tone({ at, freq: 190, freqEnd: 150, gain: gain * 0.12, decay: 0.012 });
  }

  /** A card dealt across the table: fwip, then slap. */
  card(rng: Rng, at: number, gain: number): this {
    return this.slide(rng, at, 0.055, 2500, 6500, gain * 0.55).slap(rng, at + 0.05, gain);
  }

  /** A card turned face up: a short snap of the edge, then it falls flat. */
  flip(rng: Rng, at: number, gain: number): this {
    return this.slide(rng, at, 0.035, 6000, 3000, gain * 0.45).slap(rng, at + 0.03, gain * 0.9);
  }

  /** Two clay chips touching: inharmonic modes that die out almost at once. */
  clack(rng: Rng, at: number, gain: number): this {
    const pitch = 0.92 + rng.next() * 0.16;
    const modes = [
      [2300, 1, 0.02],
      [3550, 0.55, 0.014],
      [5150, 0.3, 0.009],
      [7300, 0.15, 0.005],
    ] as const;
    for (const [freq, amp, decay] of modes) {
      this.tone({ at, freq: freq * pitch, gain: gain * amp * 0.5, decay, attack: 0.0004 });
    }
    return this.noise(rng, {
      at,
      length: 0.02,
      gain: gain * 0.5,
      filter: 'bandpass',
      freq: 3800,
      q: 1,
      attack: 0.0003,
      decay: 0.003,
    });
  }

  /** A soft mallet note: round fundamental plus a quick bright partial. */
  mallet(at: number, freq: number, gain: number, decay = 0.35): this {
    return this.tone({ at, freq, gain, decay, attack: 0.004 })
      .tone({ at, freq: freq * 2, gain: gain * 0.18, decay: decay * 0.4, attack: 0.004 })
      .tone({ at, freq: freq * 4, gain: gain * 0.12, decay: 0.03, attack: 0.002 });
  }

  /** Small-room reverb (Schroeder: parallel damped combs into all-passes). */
  room(mix: number): this {
    const dry = this.samples.slice();
    const combs = [0.0297, 0.0371, 0.0411, 0.0437].map((seconds) => ({
      buffer: new Float32Array(Math.round(seconds * SR)),
      index: 0,
      low: 0,
    }));
    const wet = new Float32Array(dry.length);
    for (let i = 0; i < dry.length; i++) {
      let sum = 0;
      for (const comb of combs) {
        const out = comb.buffer[comb.index] ?? 0;
        comb.low += 0.45 * (out - comb.low); // damping: darker tail, less metallic
        comb.buffer[comb.index] = (dry[i] ?? 0) + comb.low * 0.72;
        comb.index = (comb.index + 1) % comb.buffer.length;
        sum += out;
      }
      wet[i] = sum / combs.length;
    }
    for (const seconds of [0.005, 0.0017]) {
      const buffer = new Float32Array(Math.round(seconds * SR));
      let index = 0;
      for (let i = 0; i < wet.length; i++) {
        const delayed = buffer[index] ?? 0;
        const input = wet[i] ?? 0;
        const output = -0.7 * input + delayed;
        buffer[index] = input + 0.7 * output;
        index = (index + 1) % buffer.length;
        wet[i] = output;
      }
    }
    for (let i = 0; i < dry.length; i++) {
      this.samples[i] = (dry[i] ?? 0) * (1 - mix) + (wet[i] ?? 0) * mix * 2;
    }
    return this;
  }

  /** Scales to a fixed peak and fades the tail so cues sit at comparable loudness without clicks. */
  normalized(peak: number): Float32Array {
    let max = 0;
    for (const sample of this.samples) max = Math.max(max, Math.abs(sample));
    const scale = max === 0 ? 0 : peak / max;
    const fade = Math.round(0.03 * SR);
    return this.samples.map((sample, i) => {
      const tail = Math.min(1, (this.samples.length - i) / fade);
      return sample * scale * tail;
    });
  }

  private add(index: number, value: number): void {
    if (index < this.samples.length) this.samples[index] = (this.samples[index] ?? 0) + value;
  }
}

/** Smooth (sine-squared) rise, exponential fall, forced to zero at the end of the burst. */
function envelope(t: number, attack: number, decay: number, length: number): number {
  const rise = t < attack ? Math.sin((Math.PI / 2) * (t / attack)) ** 2 : 1;
  const fall = t < attack ? 1 : Math.exp(-(t - attack) / decay);
  const end = Math.min(1, (length - t) / 0.004);
  return rise * fall * Math.max(0, end);
}

const NOTE = { e5: 659.25, g5: 783.99, c5: 523.25, c6: 1046.5, e6: 1318.5 } as const;

function deal(rng: Rng): Float32Array {
  return new Track(0.4).card(rng, 0, 1).card(rng, 0.13, 0.85).room(0.12).normalized(0.6);
}

function flop(rng: Rng): Float32Array {
  const track = new Track(0.55);
  for (const [i, at] of [0, 0.12, 0.24].entries()) track.flip(rng, at, 1 - i * 0.08);
  return track.room(0.12).normalized(0.6);
}

function board(rng: Rng): Float32Array {
  return new Track(0.3).flip(rng, 0, 1).room(0.12).normalized(0.6);
}

function check(rng: Rng): Float32Array {
  const knock = (track: Track, at: number, gain: number): Track =>
    track.tone({ at, freq: 125, freqEnd: 95, gain: gain * 0.9, decay: 0.022 }).noise(rng, {
      at,
      length: 0.04,
      gain: gain * 0.7,
      filter: 'bandpass',
      freq: 650,
      q: 1.2,
      attack: 0.0008,
      decay: 0.009,
    });
  return knock(knock(new Track(0.35), 0, 1), 0.1, 0.8)
    .room(0.1)
    .normalized(0.65);
}

function chips(rng: Rng): Float32Array {
  const track = new Track(0.4);
  [0, 0.05, 0.085].forEach((at, i) => track.clack(rng, at + rng.next() * 0.008, 1 - i * 0.2));
  return track.room(0.15).normalized(0.5);
}

function allIn(rng: Rng): Float32Array {
  const track = new Track(0.8).noise(rng, {
    at: 0,
    length: 0.12,
    gain: 0.8,
    filter: 'lowpass',
    freq: 320,
    attack: 0.004,
    decay: 0.04,
  });
  // The whole stack pushed in: clacks that bunch together, then trail off.
  for (let i = 0; i < 12; i++) {
    const at = 0.03 + 0.4 * Math.sqrt(i / 12) + rng.next() * 0.012;
    track.clack(rng, at, 1 - i * 0.05);
  }
  return track.room(0.18).normalized(0.6);
}

function fold(rng: Rng): Float32Array {
  // Cards tossed into the muck: a lazy slide down in brightness, a soft landing.
  return new Track(0.4)
    .slide(rng, 0, 0.12, 3500, 1400, 0.6)
    .slap(rng, 0.11, 0.5)
    .room(0.12)
    .normalized(0.4);
}

function win(rng: Rng): Float32Array {
  const track = new Track(1.3);
  [NOTE.c5, NOTE.e5, NOTE.g5, NOTE.c6].forEach((freq, i) => {
    track.mallet(i * 0.1, freq, i === 3 ? 0.9 : 0.7, i === 3 ? 0.5 : 0.3);
  });
  for (let i = 0; i < 5; i++) track.clack(rng, 0.45 + i * 0.06 + rng.next() * 0.02, 0.35);
  return track.room(0.25).normalized(0.5);
}

function potOther(rng: Rng): Float32Array {
  const track = new Track(0.55).slide(rng, 0, 0.25, 1500, 900, 0.25);
  for (let i = 0; i < 6; i++) track.clack(rng, 0.03 + i * 0.05 + rng.next() * 0.02, 0.7 - i * 0.08);
  return track.room(0.18).normalized(0.35);
}

function yourTurn(): Float32Array {
  return new Track(0.9)
    .mallet(0, NOTE.g5, 0.7, 0.25)
    .mallet(0.14, NOTE.e6, 0.55, 0.35)
    .room(0.25)
    .normalized(0.35);
}

const SEEDS: Readonly<Record<SoundCue, number>> = {
  deal: 11,
  flop: 20,
  board: 12,
  check: 13,
  chips: 14,
  allIn: 15,
  fold: 16,
  win: 17,
  potOther: 18,
  yourTurn: 19,
};

export function synthesizeCue(cue: SoundCue): Float32Array {
  const rng = createMulberry32(SEEDS[cue]);
  switch (cue) {
    case 'deal':
      return deal(rng);
    case 'flop':
      return flop(rng);
    case 'board':
      return board(rng);
    case 'check':
      return check(rng);
    case 'chips':
      return chips(rng);
    case 'allIn':
      return allIn(rng);
    case 'fold':
      return fold(rng);
    case 'win':
      return win(rng);
    case 'potOther':
      return potOther(rng);
    case 'yourTurn':
      return yourTurn();
  }
}
