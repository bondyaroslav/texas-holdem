import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { HandHistoryList } from '@/features/history';

export default function HandHistoryPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="mx-auto w-full max-w-4xl py-4">
      <h1 className="text-3xl font-black">{t('pages.handHistory.title')}</h1>
      <p className="mt-1 mb-4" style={{ color: 'var(--color-muted)' }}>
        {t('pages.handHistory.description')}
      </p>
      <HandHistoryList />
    </section>
  );
}
