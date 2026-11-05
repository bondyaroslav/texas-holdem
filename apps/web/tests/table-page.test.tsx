import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { App } from '@/app';

describe('TablePage', () => {
  it('connects through the real LocalGameGateway and renders a playable table', async () => {
    window.history.pushState({}, '', '/table');
    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Стіл' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Почати роздачу' })).toBeInTheDocument();
    // Local player + 3 default bots.
    expect(await screen.findByText('Ви')).toBeInTheDocument();
  });
});
