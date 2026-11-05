import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import type { ActionInput } from '@poker/protocol';
import '@/shared/i18n';
import { BettingControls, type BettingControlsProps } from './BettingControls.js';

function baseProps(overrides: Partial<BettingControlsProps> = {}): BettingControlsProps {
  return {
    toCall: 0,
    currentBet: 0,
    minRaise: 10,
    bigBlind: 10,
    stack: 1000,
    committedThisStreet: 0,
    pot: 30,
    onAction: vi.fn(),
    ...overrides,
  };
}

describe('BettingControls — fold/check/call', () => {
  it('offers check (not call) when there is nothing to call', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(<BettingControls {...baseProps({ onAction })} />);

    expect(screen.queryByText(/колл/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Чек'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'check' });
  });

  it('offers call with the exact amount owed, and dispatches it', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(<BettingControls {...baseProps({ toCall: 25, onAction })} />);

    fireEvent.click(screen.getByText('Колл 25'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'call' });
  });

  it('dispatches fold', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(<BettingControls {...baseProps({ onAction })} />);

    fireEvent.click(screen.getByText('Фолд'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'fold' });
  });
});

describe('BettingControls — bet sizing', () => {
  it('defaults the slider to the minimum legal bet and confirms a bet', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(
      <BettingControls {...baseProps({ currentBet: 0, bigBlind: 10, stack: 1000, onAction })} />,
    );

    expect(screen.getByText('10')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Бет 10'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'bet', amount: 10 });
  });

  it('defaults to currentBet + minRaise when raising', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(
      <BettingControls
        {...baseProps({ currentBet: 20, minRaise: 20, toCall: 20, stack: 1000, onAction })}
      />,
    );

    fireEvent.click(screen.getByText('Рейз 40'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'raise', amount: 40 });
  });

  it('dispatches allIn once the all-in preset is picked and confirmed', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(
      <BettingControls
        {...baseProps({
          currentBet: 0,
          bigBlind: 10,
          stack: 100,
          committedThisStreet: 0,
          onAction,
        })}
      />,
    );

    fireEvent.click(screen.getByText('Ва-банк'));
    fireEvent.click(screen.getByRole('button', { name: /Бет 100/ }));
    expect(onAction).toHaveBeenCalledWith({ kind: 'allIn' });
  });

  it('moves the slider and confirms the chosen raise amount', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(
      <BettingControls
        {...baseProps({ currentBet: 20, minRaise: 20, toCall: 20, stack: 1000, onAction })}
      />,
    );

    fireEvent.change(screen.getByRole('slider'), { target: { value: '75' } });
    fireEvent.click(screen.getByText('Рейз 75'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'raise', amount: 75 });
  });

  it('hides the bet/raise sizer when the player cannot afford to raise over the current bet', () => {
    // committedThisStreet + stack (30) does not exceed currentBet (50) — only call/fold are legal.
    render(
      <BettingControls
        {...baseProps({
          currentBet: 50,
          toCall: 20,
          committedThisStreet: 30,
          stack: 0,
          minRaise: 50,
        })}
      />,
    );

    expect(screen.queryByText(/бет|рейз/i)).not.toBeInTheDocument();
  });
});

describe('BettingControls — hotkeys', () => {
  it('maps F to fold and C to call/check using physical keys', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    const { rerender } = render(<BettingControls {...baseProps({ toCall: 20, onAction })} />);

    fireEvent.keyDown(window, { code: 'KeyF' });
    expect(onAction).toHaveBeenLastCalledWith({ kind: 'fold' });
    fireEvent.keyDown(window, { code: 'KeyC' });
    expect(onAction).toHaveBeenLastCalledWith({ kind: 'call' });

    rerender(<BettingControls {...baseProps({ toCall: 0, onAction })} />);
    fireEvent.keyDown(window, { code: 'KeyC' });
    expect(onAction).toHaveBeenLastCalledWith({ kind: 'check' });
  });

  it('confirms the bet with R and ignores keys typed into the slider', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(<BettingControls {...baseProps({ onAction })} />);

    fireEvent.keyDown(screen.getByRole('slider'), { code: 'KeyF' });
    expect(onAction).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { code: 'KeyR' });
    expect(onAction).toHaveBeenCalledWith({ kind: 'bet', amount: 10 });
  });

  it('steps the amount by the big blind with the +/- buttons', () => {
    const onAction = vi.fn<(action: ActionInput) => void>();
    render(<BettingControls {...baseProps({ onAction })} />);

    fireEvent.click(screen.getByRole('button', { name: 'Збільшити ставку' }));
    fireEvent.click(screen.getByRole('button', { name: 'Збільшити ставку' }));
    fireEvent.click(screen.getByText('Бет 30'));
    expect(onAction).toHaveBeenCalledWith({ kind: 'bet', amount: 30 });
  });
});
