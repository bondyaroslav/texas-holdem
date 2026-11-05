import type { JSX } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, Outlet } from 'react-router-dom';
import { SoundToggle } from '@/features/settings';

const LOCALES = ['uk', 'en'] as const;

const NAV = [
  { to: '/lobby', key: 'nav.lobby' },
  { to: '/table', key: 'nav.table' },
  { to: '/settings', key: 'nav.settings' },
  { to: '/hands', key: 'nav.handRankings' },
  { to: '/history', key: 'nav.handHistory' },
  { to: '/stats', key: 'nav.stats' },
  { to: '/glossary', key: 'nav.glossary' },
] as const;

/** Shared chrome: brand, main navigation and language switcher around every page. */
export function AppLayout(): JSX.Element {
  const { t, i18n } = useTranslation();

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-7xl flex-col px-4 sm:px-6">
      <header className="flex flex-wrap items-center justify-between gap-3 py-4">
        <NavLink to="/lobby" className="flex items-center gap-2 text-lg font-extrabold">
          <span aria-hidden="true" className="text-2xl" style={{ color: 'var(--color-accent)' }}>
            ♠
          </span>
          <span>{t('app.name')}</span>
        </NavLink>

        <nav aria-label={t('nav.main')} className="flex flex-wrap items-center gap-1">
          {NAV.map((item) => (
            <NavLink key={item.to} to={item.to} className="nav-link">
              {t(item.key)}
            </NavLink>
          ))}
          <SoundToggle />
          <div className="ml-2 flex overflow-hidden rounded-lg border border-white/10">
            {LOCALES.map((lng) => (
              <button
                key={lng}
                type="button"
                lang={lng}
                aria-pressed={i18n.language === lng}
                onClick={() => void i18n.changeLanguage(lng)}
                className="px-2.5 py-1.5 text-xs font-bold uppercase aria-pressed:bg-amber-300 aria-pressed:text-black"
              >
                {lng}
              </button>
            ))}
          </div>
        </nav>
      </header>
      <main className="flex flex-1 flex-col pb-10">
        <Outlet />
      </main>
    </div>
  );
}
