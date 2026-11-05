import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Table } from '@/features/table';

export default function TablePage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section>
      <h1 className="sr-only">{t('pages.table.title')}</h1>
      <Table />
    </section>
  );
}
