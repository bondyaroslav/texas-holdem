import type { JSX } from 'react';
import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { AppLayout } from './AppLayout';

const LobbyPage = lazy(() => import('@/pages/Lobby'));
const TablePage = lazy(() => import('@/pages/Table'));
const SettingsPage = lazy(() => import('@/pages/Settings'));
const HandRankingsPage = lazy(() => import('@/pages/HandRankings'));
const HandHistoryPage = lazy(() => import('@/pages/HandHistory'));
const HandReviewPage = lazy(() => import('@/pages/HandReview'));
const StatsPage = lazy(() => import('@/pages/Stats'));
const GlossaryPage = lazy(() => import('@/pages/Glossary'));

export function AppRouter(): JSX.Element {
  return (
    <Suspense fallback={null}>
      <Routes>
        <Route element={<AppLayout />}>
          <Route path="/" element={<Navigate to="/lobby" replace />} />
          <Route path="/lobby" element={<LobbyPage />} />
          <Route path="/table" element={<TablePage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/hands" element={<HandRankingsPage />} />
          <Route path="/history" element={<HandHistoryPage />} />
          <Route path="/history/:handId" element={<HandReviewPage />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/glossary" element={<GlossaryPage />} />
        </Route>
      </Routes>
    </Suspense>
  );
}
