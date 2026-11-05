import { describe, expect, it } from 'vitest';
import { difficultyProfiles } from './index.js';

describe('difficultyProfiles', () => {
  it('defines a profile for every difficulty level', () => {
    const levels = Object.keys(difficultyProfiles);
    expect(levels).toEqual(['beginner', 'easy', 'medium', 'hard', 'expert']);
  });

  it('only enables equity calculation from hard upwards', () => {
    expect(difficultyProfiles.medium.usesEquityCalculation).toBe(false);
    expect(difficultyProfiles.hard.usesEquityCalculation).toBe(true);
    expect(difficultyProfiles.expert.usesEquityCalculation).toBe(true);
  });
});
