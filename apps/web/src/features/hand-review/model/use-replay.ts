import { useCallback, useMemo, useState } from 'react';
import type { ReplayFrame } from './timeline.js';

export interface ReplayControls {
  readonly index: number;
  readonly frame: ReplayFrame | undefined;
  readonly count: number;
  readonly first: () => void;
  readonly last: () => void;
  readonly next: () => void;
  readonly previous: () => void;
  readonly nextStreet: () => void;
  readonly previousStreet: () => void;
  readonly goTo: (index: number) => void;
}

/** Step/street navigation over replay frames; starts at the deal. */
export function useReplay(frames: readonly ReplayFrame[]): ReplayControls {
  const [index, setIndex] = useState(0);
  const count = frames.length;
  const clamp = useCallback(
    (i: number) => Math.min(Math.max(i, 0), Math.max(count - 1, 0)),
    [count],
  );

  // A street begins where its street differs from the frame before.
  const streetStarts = useMemo(
    () => frames.flatMap((f, i) => (i === 0 || frames[i - 1]?.street !== f.street ? [i] : [])),
    [frames],
  );

  return {
    index,
    frame: frames[index],
    count,
    first: () => {
      setIndex(0);
    },
    last: () => {
      setIndex(clamp(count - 1));
    },
    next: () => {
      setIndex((i) => clamp(i + 1));
    },
    previous: () => {
      setIndex((i) => clamp(i - 1));
    },
    nextStreet: () => {
      setIndex((i) => streetStarts.find((s) => s > i) ?? clamp(count - 1));
    },
    previousStreet: () => {
      setIndex((i) => [...streetStarts].reverse().find((s) => s < i) ?? 0);
    },
    goTo: (i: number) => {
      setIndex(clamp(i));
    },
  };
}
