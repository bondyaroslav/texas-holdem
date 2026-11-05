import type { HandEntry } from '@/shared';

export interface WinningsSeries {
  readonly actual: readonly number[];
  /** All-in adjusted: hands where the hero was all in count at their expected value. */
  readonly expected: readonly number[];
}

/** Cumulative big blinds won, hand by hand, oldest first. */
export function cumulativeWinnings(entries: readonly HandEntry[]): WinningsSeries {
  const ordered = [...entries].sort((a, b) => a.record.endedAt - b.record.endedAt);
  const actual: number[] = [];
  const expected: number[] = [];
  let a = 0;
  let e = 0;
  for (const { record, analysis, summary } of ordered) {
    const allIn = analysis?.outcome?.allIn;
    a += summary.heroNetBb;
    e += allIn ? allIn.expectedNet / record.blinds.bigBlind : summary.heroNetBb;
    actual.push(Math.round(a * 10) / 10);
    expected.push(Math.round(e * 10) / 10);
  }
  return { actual, expected };
}
