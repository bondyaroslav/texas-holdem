import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Glossary } from '@/features/glossary';

export default function GlossaryPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="mx-auto w-full max-w-3xl py-4">
      <h1 className="mb-4 text-3xl font-black">{t('pages.glossary.title')}</h1>
      <Glossary />
    </section>
  );
}
