import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';

export interface PotProps {
  readonly amount: number;
}

export function Pot({ amount }: PotProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center gap-1 rounded-full bg-black/30 px-4 py-2">
      <span className="text-[10px] uppercase tracking-wide opacity-70">{t('table.pot')}</span>
      <span className="text-lg font-semibold tabular-nums">{amount}</span>
    </div>
  );
}
