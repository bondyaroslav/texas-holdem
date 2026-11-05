import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router-dom';
import { HandReview } from '@/features/hand-review';
import { useHandEntry } from '@/shared';

export default function HandReviewPage(): JSX.Element {
  const { t } = useTranslation();
  const { handId = '' } = useParams();
  const entry = useHandEntry(handId);

  let body: JSX.Element;
  if (entry.status === 'loading') body = <p role="status">{t('history.loading')}</p>;
  else if (entry.status === 'error') body = <p role="alert">{t('history.error')}</p>;
  else if (entry.value === null)
    body = (
      <p role="alert" className="panel">
        {t('review.notFound')}
      </p>
    );
  else body = <HandReview entry={entry.value} />;

  return (
    <section className="mx-auto w-full max-w-4xl py-4">
      <Link to="/history" className="nav-link -ml-3 inline-block">
        ← {t('review.back')}
      </Link>
      <h1 className="mb-4 text-3xl font-black">
        {entry.status === 'ready' && entry.value
          ? t('review.title', { number: entry.value.record.handNumber })
          : t('review.titleGeneric')}
      </h1>
      {body}
    </section>
  );
}
