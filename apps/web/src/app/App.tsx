import type { JSX } from 'react';
import { ErrorBoundary } from './error-boundary';
import { AppProviders } from './providers';
import { AppRouter } from './router';

export function App(): JSX.Element {
  return (
    <ErrorBoundary>
      <AppProviders>
        <AppRouter />
      </AppProviders>
    </ErrorBoundary>
  );
}
