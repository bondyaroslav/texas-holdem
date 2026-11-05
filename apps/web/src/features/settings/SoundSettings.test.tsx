import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { I18nextProvider } from 'react-i18next';
import i18next from '@/shared/i18n';
import { SoundContext, type SoundCue, type SoundService, type SoundSettings } from '@/shared';
import { SoundSettings as SoundSettingsPanel } from './SoundSettings.js';
import { SoundToggle } from './SoundToggle.js';

function fakeService(): SoundService & { played: SoundCue[] } {
  let settings: SoundSettings = { enabled: true, volume: 0.5 };
  const listeners = new Set<() => void>();
  return {
    played: [],
    play(cue) {
      this.played.push(cue);
    },
    getSettings: () => settings,
    setSettings(next) {
      settings = next;
      for (const listener of listeners) listener();
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

function renderWith(service: SoundService): void {
  render(
    <I18nextProvider i18n={i18next}>
      <SoundContext.Provider value={service}>
        <SoundToggle />
        <SoundSettingsPanel />
      </SoundContext.Provider>
    </I18nextProvider>,
  );
}

describe('sound settings', () => {
  beforeEach(async () => {
    await i18next.changeLanguage('uk');
  });

  it('changes volume, previews and mutes from the header toggle', () => {
    const service = fakeService();
    renderWith(service);

    fireEvent.change(screen.getByRole('slider', { name: 'Гучність' }), {
      target: { value: '80' },
    });
    expect(service.getSettings().volume).toBe(0.8);

    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: 'Прослухати' }));
    vi.runAllTimers();
    vi.useRealTimers();
    expect(service.played).toEqual(['deal', 'chips']);

    const toggle = screen.getByRole('button', { name: 'Звук' });
    expect(toggle).toHaveAttribute('aria-pressed', 'true');
    fireEvent.click(toggle);
    expect(service.getSettings().enabled).toBe(false);
    expect(toggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('checkbox', { name: 'Звукові ефекти' })).not.toBeChecked();
    expect(screen.getByRole('button', { name: 'Прослухати' })).toBeDisabled();
  });
});
