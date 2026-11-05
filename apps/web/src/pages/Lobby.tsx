import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';

const SUITS = ['♠', '♥', '♣', '♦'] as const;

export default function LobbyPage(): JSX.Element {
  const { t } = useTranslation();

  return (
    <section className="relative flex flex-1 flex-col items-center justify-center gap-8 py-12 text-center">
      <div aria-hidden="true" className="flex gap-4 text-4xl">
        {SUITS.map((suit, i) => (
          <span key={suit} className={i % 2 === 1 ? 'text-red-500' : 'text-slate-100'}>
            {suit}
          </span>
        ))}
      </div>

      <div className="flex flex-col gap-3">
        <h1 className="text-xs font-bold uppercase tracking-[0.4em] text-amber-300">
          {t('pages.lobby.title')}
        </h1>
        <p
          aria-hidden="true"
          className="bg-gradient-to-b from-amber-100 to-amber-400 bg-clip-text text-5xl font-black text-transparent sm:text-7xl"
        >
          {t('app.name')}
        </p>
        <p className="mx-auto max-w-md text-lg" style={{ color: 'var(--color-muted)' }}>
          {t('pages.lobby.description')}
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link to="/table" className="btn btn-primary btn-lg">
          {t('pages.lobby.quickPlay')}
        </Link>
        <Link to="/settings" className="btn btn-lg">
          {t('pages.lobby.customize')}
        </Link>
      </div>

      <ul className="mt-4 grid w-full max-w-3xl gap-3 sm:grid-cols-3">
        {(['noLimit', 'bots', 'offline'] as const).map((key) => (
          <li key={key} className="panel p-4 text-sm">
            <p className="font-bold text-amber-200">{t(`pages.lobby.features.${key}.title`)}</p>
            <p className="mt-1" style={{ color: 'var(--color-muted)' }}>
              {t(`pages.lobby.features.${key}.text`)}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
