import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@/shared/i18n';
import { HandRankings } from './HandRankings.js';

describe('HandRankings', () => {
  it('lists all ten combinations, strongest first', () => {
    render(<HandRankings />);

    const names = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(names).toHaveLength(10);
    expect(names[0]).toBe('Роял-флеш');
    expect(names[9]).toBe('Старша карта');
  });

  it('shows an example hand of five cards for each combination', () => {
    render(<HandRankings />);

    expect(screen.getAllByRole('listitem')).toHaveLength(10);
    // 10 combinations × 5 example cards.
    expect(screen.getAllByLabelText(/ of /)).toHaveLength(50);
  });
});
