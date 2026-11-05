import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { HandRankings } from '@/features/hand-rankings';

export default function HandRankingsPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="mx-auto w-full max-w-3xl py-4">
      <h1 className="text-3xl font-black">{t('pages.handRankings.title')}</h1>
      <p className="mt-1 mb-4" style={{ color: 'var(--color-muted)' }}>
        {t('pages.handRankings.description')}
      </p>
      <HandRankings />
    </section>
  );
}
