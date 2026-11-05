import type { JSX } from 'react';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router-dom';

export const GLOSSARY_TERMS = [
  'equity',
  'range',
  'potOdds',
  'ev',
  'evLoss',
  'foldEquity',
  'accuracy',
  'bb',
  'bb100',
  'vpip',
  'pfr',
  'af',
  'wtsd',
  'wsd',
  'allInEv',
  'kicker',
  'sidePot',
  'splitPot',
  'badBeat',
  'suckOut',
  'verdicts',
] as const;

/** Every term the analysis uses, each with an anchor that tooltips link to. */
export function Glossary(): JSX.Element {
  const { t } = useTranslation();
  const { hash } = useLocation();

  // The router does not scroll to fragments; focusing the term scrolls to it and puts keyboard users there.
  useEffect(() => {
    const target = hash ? document.getElementById(decodeURIComponent(hash.slice(1))) : null;
    target?.focus();
  }, [hash]);

  return (
    <dl className="flex flex-col gap-3">
      {GLOSSARY_TERMS.map((term) => (
        <div key={term} id={term} tabIndex={-1} className="panel scroll-mt-4 p-4">
          <dt className="text-lg font-extrabold">{t(`glossary.terms.${term}.name`)}</dt>
          <dd className="mt-1">{t(`glossary.terms.${term}.long`)}</dd>
        </div>
      ))}
    </dl>
  );
}
