import { equityCacheKey } from './cache.js';
import { allHands, validateInput } from './cards.js';
import { countRunouts, exactEquity } from './exact.js';
import { DEFAULT_ITERATIONS, DEFAULT_SEED, monteCarloEquity } from './monte-carlo.js';
import type { EquityInput, EquityOptions, EquityResult } from './types.js';

export const DEFAULT_EXACT_LIMIT = 100_000;

/**
 * Equity of every participant. Enumerates all run-outs when they are few
 * enough and everyone's cards are known; otherwise samples them.
 */
export function computeEquity(input: EquityInput, options: EquityOptions = {}): EquityResult {
  validateInput(input);

  const mode = options.mode ?? 'auto';
  const exactLimit = options.exactLimit ?? DEFAULT_EXACT_LIMIT;
  const known = allHands(input.participants);
  if (mode === 'exact' && !known) {
    throw new RangeError('Exact equity needs known hands; use Monte Carlo for ranges');
  }
  const useExact =
    known && (mode === 'exact' || (mode === 'auto' && countRunouts(input) <= exactLimit));

  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  const seed = options.seed ?? DEFAULT_SEED;
  // A run stopped by the clock is not reproducible, so it must not poison the cache.
  const cacheable = options.cache !== undefined && (useExact || options.maxTimeMs === undefined);
  const key = cacheable
    ? equityCacheKey(input, useExact ? 'exact' : `mc:${String(iterations)}:${String(seed)}`)
    : null;

  if (options.cache && key !== null) {
    const hit = options.cache.get(key);
    if (hit) return hit;
  }

  const result = useExact
    ? exactEquity(input)
    : monteCarloEquity(input, {
        iterations,
        seed,
        ...(options.maxTimeMs !== undefined ? { maxTimeMs: options.maxTimeMs } : {}),
        ...(options.now ? { now: options.now } : {}),
      });

  if (options.cache && key !== null) {
    options.cache.set(key, result);
  }
  return result;
}
