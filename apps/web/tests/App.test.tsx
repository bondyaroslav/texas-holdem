import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '@/app';

describe('App', () => {
  it('renders the lobby page by default', async () => {
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Лобі' })).toBeInTheDocument();
  });
});
