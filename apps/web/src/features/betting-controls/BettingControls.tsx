import { useEffect, useState } from 'react';
import type { CSSProperties, JSX } from 'react';
import { useTranslation } from 'react-i18next';
import type { ActionInput, Chips } from '@poker/protocol';

export interface BettingControlsProps {
  readonly toCall: number;
  readonly currentBet: number;
  readonly minRaise: number;
  readonly bigBlind: number;
  readonly stack: number;
  readonly committedThisStreet: number;
  readonly pot: number;
  readonly onAction: (action: ActionInput) => void;
}

/**
 * Fold/check/call plus a bet-or-raise sizer. A controlled component on
 * purpose — it has no idea about the gateway or the store, just the numbers
 * needed to compute legal amounts and a callback for the chosen action, so
 * it stays usable (and testable) without `features/table`'s state.
 */
export function BettingControls({
  toCall,
  currentBet,
  minRaise,
  bigBlind,
  stack,
  committedThisStreet,
  pot,
  onAction,
}: BettingControlsProps): JSX.Element {
  const { t } = useTranslation();
  const isFreshBet = currentBet <= 0;
  const maxCommit = committedThisStreet + stack;
  const minCommitDesired = isFreshBet ? Math.min(bigBlind, stack) : currentBet + minRaise;
  const minCommit = Math.min(minCommitDesired, maxCommit);
  const canRaiseOrBet = isFreshBet ? stack > 0 : maxCommit > currentBet;

  const [amount, setAmount] = useState(minCommit);
  const clampedAmount = Math.min(Math.max(amount, minCommit), maxCommit);

  const presets = [
    { label: t('table.betting.halfPot'), value: Math.round(pot / 2) },
    { label: t('table.betting.pot'), value: pot },
    { label: t('table.betting.allIn'), value: maxCommit },
  ].map((preset) => ({
    ...preset,
    value: Math.min(Math.max(preset.value, minCommit), maxCommit),
  }));
  const step = Math.max(1, bigBlind);
  const fillPercent =
    maxCommit > minCommit ? ((clampedAmount - minCommit) / (maxCommit - minCommit)) * 100 : 100;

  const handleConfirm = (): void => {
    // Already a non-negative integer by construction (clamped from Chips-typed
    // props), so asserting the brand here is safe without protocol taking a
    // runtime dependency on `@poker/engine` (kept types-only, CLAUDE.md §3.1).
    const brandedAmount = clampedAmount as Chips;
    if (clampedAmount >= maxCommit) {
      onAction({ kind: 'allIn' });
    } else if (isFreshBet) {
      onAction({ kind: 'bet', amount: brandedAmount });
    } else {
      onAction({ kind: 'raise', amount: brandedAmount });
    }
  };

  // Layout-independent hotkeys (physical keys): F fold, C check/call, R bet/raise.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target;
      if (
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        (target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))
      ) {
        return;
      }
      if (event.code === 'KeyF') {
        onAction({ kind: 'fold' });
      } else if (event.code === 'KeyC') {
        onAction(toCall > 0 ? { kind: 'call' } : { kind: 'check' });
      } else if (event.code === 'KeyR' && canRaiseOrBet) {
        handleConfirm();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
    };
  });

  const verb = isFreshBet ? t('table.actions.bet') : t('table.actions.raise');

  return (
    <div className="betting-dock mx-auto flex w-full max-w-xl flex-col gap-4 md:max-w-3xl md:flex-row md:items-center md:gap-6">
      {canRaiseOrBet ? (
        <div className="flex w-full flex-col gap-3 md:flex-1">
          <div className="flex flex-wrap items-center gap-2">
            {presets.map((preset) => (
              <button
                key={preset.label}
                type="button"
                className="preset-pill"
                onClick={() => {
                  setAmount(preset.value);
                }}
              >
                {preset.label}
                <span aria-hidden="true">{preset.value}</span>
              </button>
            ))}
          </div>

          <label className="flex w-full items-center gap-3">
            <span className="sr-only">{verb}</span>
            <button
              type="button"
              className="step-btn"
              aria-label={t('table.betting.decrease')}
              onClick={() => {
                setAmount(Math.max(minCommit, clampedAmount - step));
              }}
            >
              −
            </button>
            <input
              type="range"
              className="bet-slider flex-1"
              style={{ '--fill': `${String(fillPercent)}%` } as CSSProperties}
              min={minCommit}
              max={maxCommit}
              value={clampedAmount}
              onChange={(event) => {
                setAmount(Number(event.target.value));
              }}
            />
            <button
              type="button"
              className="step-btn"
              aria-label={t('table.betting.increase')}
              onClick={() => {
                setAmount(Math.min(maxCommit, clampedAmount + step));
              }}
            >
              +
            </button>
            <span className="amount-chip">{clampedAmount}</span>
          </label>

          <button type="button" className="action-btn action-raise" onClick={handleConfirm}>
            <ActionIcon kind="raise" />
            {verb} {clampedAmount}
            <kbd aria-hidden="true">R</kbd>
          </button>
        </div>
      ) : null}
      <div className="flex w-full gap-3 md:ml-auto md:w-44 md:shrink-0 md:flex-col">
        <button
          type="button"
          className="action-btn action-fold"
          onClick={() => {
            onAction({ kind: 'fold' });
          }}
        >
          <ActionIcon kind="fold" />
          {t('table.actions.fold')}
          <kbd aria-hidden="true">F</kbd>
        </button>
        <button
          type="button"
          className="action-btn action-call"
          onClick={() => {
            onAction(toCall > 0 ? { kind: 'call' } : { kind: 'check' });
          }}
        >
          <ActionIcon kind="call" />
          {toCall > 0 ? t('table.actions.call', { amount: toCall }) : t('table.actions.check')}
          <kbd aria-hidden="true">C</kbd>
        </button>
      </div>
    </div>
  );
}

type IconKind = 'fold' | 'call' | 'raise';

function ActionIcon({ kind }: { readonly kind: IconKind }): JSX.Element {
  const paths: Readonly<Record<IconKind, string>> = {
    fold: 'M6 6l12 12M18 6L6 18',
    call: 'M5 12.5l4.5 4.5L19 7.5',
    raise: 'M12 19V5m0 0l-6 6m6-6l6 6',
  };
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d={paths[kind]} />
    </svg>
  );
}
