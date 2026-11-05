import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { HistorySettings, Settings, SoundSettings } from '@/features/settings';

export default function SettingsPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="mx-auto w-full max-w-xl py-4">
      <h1 className="mb-4 text-3xl font-black">{t('pages.settings.title')}</h1>
      <Settings />
      <SoundSettings />
      <HistorySettings />
    </section>
  );
}
