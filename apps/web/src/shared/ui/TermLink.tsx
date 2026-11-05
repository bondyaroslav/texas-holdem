import type { JSX, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

export interface TermLinkProps {
  /** Glossary entry id, e.g. `vpip` → `/glossary#vpip`. */
  readonly term: string;
  readonly children: ReactNode;
}

/** A poker term that explains itself on hover and links to its glossary entry. */
export function TermLink({ term, children }: TermLinkProps): JSX.Element {
  const { t } = useTranslation();
  return (
    <Link to={`/glossary#${term}`} className="term-link" title={t(`glossary.terms.${term}.short`)}>
      {children}
    </Link>
  );
}
