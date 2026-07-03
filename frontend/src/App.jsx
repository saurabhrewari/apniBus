import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';

const HomePage = lazy(() => import('./pages/HomePage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const PassengerPage = lazy(() => import('./pages/PassengerPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const LiveStatusPage = lazy(() => import('./pages/LiveStatusPage'));
const AuthorityPage = lazy(() => import('./pages/AuthorityPage'));
const AuthorityBusStatusPage = lazy(() => import('./pages/AuthorityBusStatusPage'));

function PageLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 text-mist">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4 text-sm text-slate-200">
        Loading ApniBus...
      </div>
    </main>
  );
}

export default function App() {
  return (
    <Suspense fallback={<PageLoader />}>
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/driver" element={<DriverPage />} />
        <Route path="/passenger" element={<PassengerPage />} />
        <Route path="/search-results" element={<SearchResultsPage />} />
        <Route path="/live-status" element={<LiveStatusPage />} />
        <Route path="/authority" element={<AuthorityPage />} />
        <Route path="/authority/bus/:busNumber" element={<AuthorityBusStatusPage />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </Suspense>
  );
}
