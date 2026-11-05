import i18next from 'i18next';
import { initReactI18next } from 'react-i18next';
import uk from './locales/uk/common.json';
import en from './locales/en/common.json';

export const defaultLocale = 'en';
export const supportedLocales = ['uk', 'en'] as const;
export type SupportedLocale = (typeof supportedLocales)[number];

void i18next.use(initReactI18next).init({
  lng: defaultLocale,
  fallbackLng: defaultLocale,
  supportedLngs: supportedLocales,
  resources: {
    uk: { common: uk },
    en: { common: en },
  },
  defaultNS: 'common',
  interpolation: { escapeValue: false },
});

export default i18next;
