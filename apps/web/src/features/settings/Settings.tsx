import { useState } from 'react';
import type { JSX, SyntheticEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { tableConfigSchema, type TableConfig } from '@poker/protocol';
import { useSettingsRepository } from '@/shared';
import { useSettingsStore } from './model/settings-store.js';

type Difficulty = TableConfig['botDifficulty'];

const DIFFICULTIES: readonly Difficulty[] = [
  'beginner',
  'easy',
  'medium',
  'hard',
  'expert',
  'mixed',
];

export function Settings(): JSX.Element {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const repository = useSettingsRepository();
  const config = useSettingsStore((state) => state.config);
  const setConfig = useSettingsStore((state) => state.setConfig);
  const saveToRepository = useSettingsStore((state) => state.saveToRepository);

  const [draft, setDraft] = useState<TableConfig>(config);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const result = tableConfigSchema.safeParse(draft);
    if (!result.success) {
      setError(result.error.issues.map((issue) => issue.message).join(' '));
      return;
    }
    setError(null);
    setConfig(result.data);
    saveToRepository(repository);
    void navigate('/table');
  };

  return (
    <form onSubmit={handleSubmit} noValidate className="panel grid gap-4 sm:grid-cols-2">
      {error ? (
        <p role="alert" className="rounded-xl bg-red-950/60 p-3 text-sm text-red-300 sm:col-span-2">
          {error}
        </p>
      ) : null}

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {t('settings.botCount')}
        <input
          className="field"
          type="number"
          min={1}
          max={8}
          value={draft.botCount}
          onChange={(event) => {
            setDraft({ ...draft, botCount: Number(event.target.value) });
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {t('settings.botDifficulty')}
        <select
          className="field"
          aria-describedby="difficulty-hint"
          value={draft.botDifficulty}
          onChange={(event) => {
            setDraft({ ...draft, botDifficulty: event.target.value as Difficulty });
          }}
        >
          {DIFFICULTIES.map((level) => (
            <option key={level} value={level}>
              {t(`settings.difficulty.${level}`)}
            </option>
          ))}
        </select>
        <span id="difficulty-hint" className="font-normal" style={{ color: 'var(--color-muted)' }}>
          {t(`settings.difficultyHint.${draft.botDifficulty}`)}
        </span>
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {t('settings.startingStack')}
        <input
          className="field"
          type="number"
          min={1}
          value={draft.startingStack}
          onChange={(event) => {
            setDraft({ ...draft, startingStack: Number(event.target.value) });
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {t('settings.smallBlind')}
        <input
          className="field"
          type="number"
          min={1}
          value={draft.smallBlind}
          onChange={(event) => {
            setDraft({ ...draft, smallBlind: Number(event.target.value) });
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {t('settings.bigBlind')}
        <input
          className="field"
          type="number"
          min={1}
          value={draft.bigBlind}
          onChange={(event) => {
            setDraft({ ...draft, bigBlind: Number(event.target.value) });
          }}
        />
      </label>

      <label className="flex flex-col gap-1.5 text-sm font-semibold text-slate-300">
        {t('settings.ante')}
        <input
          className="field"
          type="number"
          min={0}
          value={draft.ante}
          onChange={(event) => {
            setDraft({ ...draft, ante: Number(event.target.value) });
          }}
        />
      </label>

      <button type="submit" className="btn btn-primary btn-lg mt-2 sm:col-span-2">
        {t('settings.startGame')}
      </button>
    </form>
  );
}
