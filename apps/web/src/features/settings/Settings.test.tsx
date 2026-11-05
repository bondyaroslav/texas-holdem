import { beforeEach, describe, expect, it } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import type { SettingsRepository, TableConfig } from '@poker/protocol';
import { SettingsRepositoryContext } from '@/shared';
import '@/shared/i18n';
import { Settings } from './Settings.js';
import { useSettingsStore } from './model/settings-store.js';
import { DEFAULT_TABLE_CONFIG } from './model/default-config.js';

function fakeRepository(): SettingsRepository & { readonly saved: TableConfig[] } {
  const saved: TableConfig[] = [];
  return {
    saved,
    load: () => null,
    save: (config) => {
      saved.push(config);
    },
  };
}

function renderSettings(repository: SettingsRepository) {
  return render(
    <SettingsRepositoryContext.Provider value={repository}>
      <MemoryRouter initialEntries={['/settings']}>
        <Routes>
          <Route path="/settings" element={<Settings />} />
          <Route path="/table" element={<div>table page</div>} />
        </Routes>
      </MemoryRouter>
    </SettingsRepositoryContext.Provider>,
  );
}

beforeEach(() => {
  useSettingsStore.getState().setConfig(DEFAULT_TABLE_CONFIG);
});

describe('Settings', () => {
  it('renders the current config as the default field values', () => {
    renderSettings(fakeRepository());
    expect(screen.getByLabelText('Кількість ботів')).toHaveValue(DEFAULT_TABLE_CONFIG.botCount);
    expect(screen.getByLabelText('Великий блайнд')).toHaveValue(DEFAULT_TABLE_CONFIG.bigBlind);
  });

  it('saves to the repository, updates the store and navigates to the table on valid submit', () => {
    const repository = fakeRepository();
    renderSettings(repository);

    fireEvent.change(screen.getByLabelText('Кількість ботів'), { target: { value: '5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Почати гру' }));

    expect(repository.saved).toHaveLength(1);
    expect(repository.saved[0]?.botCount).toBe(5);
    expect(useSettingsStore.getState().config.botCount).toBe(5);
    expect(screen.getByText('table page')).toBeInTheDocument();
  });

  it('shows a validation error and does not save or navigate on invalid input', () => {
    const repository = fakeRepository();
    renderSettings(repository);

    fireEvent.change(screen.getByLabelText('Кількість ботів'), { target: { value: '99' } });
    fireEvent.click(screen.getByRole('button', { name: 'Почати гру' }));

    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(repository.saved).toHaveLength(0);
    expect(screen.queryByText('table page')).not.toBeInTheDocument();
  });
});
