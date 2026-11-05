import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from '@/app';
import { useSettingsStore } from '@/features/settings';
import { LocalSettingsRepository } from '@/infrastructure/local-settings-repository';
import './styles/index.css';

// Hydrate synchronously, before the first render — a `useEffect` in a
// provider would run after `Table`'s own mount effect already fired
// `connect()` with the default config (child effects run before parent ones).
useSettingsStore.getState().loadFromRepository(new LocalSettingsRepository());

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Root element #root not found');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
