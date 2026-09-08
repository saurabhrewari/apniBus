import { lazy, Suspense, useEffect } from 'react';
import { matchPath, RouteParamsProvider, useLocation, useNavigate } from './lib/router';

const HomePage = lazy(() => import('./pages/HomePage'));
const DriverPage = lazy(() => import('./pages/DriverPage'));
const PassengerPage = lazy(() => import('./pages/PassengerPage'));
const SearchResultsPage = lazy(() => import('./pages/SearchResultsPage'));
const LiveStatusPage = lazy(() => import('./pages/LiveStatusPage'));
const AuthorityPage = lazy(() => import('./pages/AuthorityPage'));
const AuthorityBusStatusPage = lazy(() => import('./pages/AuthorityBusStatusPage'));

const routes = [
  { path: '/', element: <HomePage /> },
  { path: '/driver', element: <DriverPage /> },
  { path: '/passenger', element: <PassengerPage /> },
  { path: '/search-results', element: <SearchResultsPage /> },
  { path: '/live-status', element: <LiveStatusPage /> },
  { path: '/authority', element: <AuthorityPage /> },
  { path: '/authority/bus/:busNumber', element: <AuthorityBusStatusPage /> }
];

function PageLoader() {
  return (
    <main className="grid min-h-screen place-items-center bg-ink px-4 text-mist">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 px-5 py-4 text-sm text-slate-200">
        Loading ApniBus...
      </div>
    </main>
  );
}

function RedirectHome() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/', { replace: true });
  }, [navigate]);

  return <PageLoader />;
}

export default function App() {
  const location = useLocation();
  const matchedRoute = routes
    .map((route) => ({ route, match: matchPath(route.path, location.pathname) }))
    .find((item) => item.match);

  if (!matchedRoute) {
    return <RedirectHome />;
  }

  return (
    <Suspense fallback={<PageLoader />}>
      <RouteParamsProvider params={matchedRoute.match.params}>
        {matchedRoute.route.element}
      </RouteParamsProvider>
    </Suspense>
  );
}
