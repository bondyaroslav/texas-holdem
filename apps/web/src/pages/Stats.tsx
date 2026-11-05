import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { StatsView } from '@/features/stats';

export default function StatsPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="mx-auto w-full max-w-4xl py-4">
      <h1 className="text-3xl font-black">{t('pages.stats.title')}</h1>
      <p className="mt-1 mb-4" style={{ color: 'var(--color-muted)' }}>
        {t('pages.stats.description')}
      </p>
      <StatsView />
    </section>
  );
}
