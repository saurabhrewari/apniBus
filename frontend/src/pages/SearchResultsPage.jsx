import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import api from '../lib/api';
import { cacheRoute, normalizeBus, saveRecentBus, stopLabel } from '../lib/bus';

function landmarkForBus(bus) {
  if (bus.landmark) {
    return bus.landmark;
  }

  const index = Math.max((Number(bus.currentStopIndex) || 0) - 1, 0);
  const stop = bus.stops?.[index];
  if (!stop) {
    return 'Waiting for first live update';
  }

  return `Passed ${stopLabel(stop)} recently`;
}

export default function SearchResultsPage() {
  const [searchParams] = useSearchParams();
  const [results, setResults] = useState([]);
  const [status, setStatus] = useState('Loading matching buses...');
  const [error, setError] = useState('');

  const query = searchParams.get('query') || '';
  const from = searchParams.get('from') || '';
  const to = searchParams.get('to') || '';

  useEffect(() => {
    async function loadResults() {
      try {
        const response = await api.get('/api/search', { params: { query, from, to } });
        const nextResults = (response.data.results || []).map(normalizeBus);
        setResults(nextResults);
        setStatus(
          nextResults.length > 0
            ? `${nextResults.length} bus${nextResults.length === 1 ? '' : 'es'} found`
            : 'No active buses matched this search.'
        );
        setError('');
      } catch (loadError) {
        console.error(loadError);
        setError('Could not load search results. Start the backend and try again.');
      }
    }

    loadResults();
  }, [query, from, to]);

  const heading = useMemo(() => {
    if (from || to) {
      return `${from || 'Any stop'} to ${to || 'Any stop'}`;
    }

    return query ? `Bus ${query}` : 'All buses';
  }, [from, query, to]);

  return (
    <main className="min-h-screen bg-ink text-mist">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-tide">
              Search Results
            </p>
            <h1 className="mt-2 font-display text-4xl text-white">{heading}</h1>
            <p className="mt-2 text-sm text-slate-300">{status}</p>
          </div>
          <Link
            to="/"
            className="w-fit rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            New Search
          </Link>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-4">
          {results.length > 0 ? (
            results.map((bus) => {
              const eta = bus.eta;
              const isDelayed = eta?.status === 'Delayed';

              return (
                <Link
                  key={bus._id || bus.busNumber}
                  to={`/live-status?bus=${encodeURIComponent(bus.busNumber)}`}
                  onClick={() => {
                    saveRecentBus(bus.busNumber);
                    cacheRoute(bus);
                  }}
                  className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 transition hover:border-tide/50 hover:bg-white/10"
                >
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                    <div>
                      <p className="font-display text-2xl text-white">{bus.busNumber}</p>
                      <p className="mt-1 text-sm text-slate-300">
                        {bus.routeName || bus.routeNumber || bus.routeId || 'Route not set'}
                      </p>
                      <p className="mt-3 text-sm text-slate-400">{landmarkForBus(bus)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <span
                        className={`rounded-full px-3 py-2 text-xs font-semibold ${
                          isDelayed ? 'bg-rose-500/15 text-rose-100' : 'bg-moss/15 text-emerald-100'
                        }`}
                      >
                        {eta?.status || 'Awaiting ETA'}
                      </span>
                      <span
                        className={`rounded-full px-3 py-2 text-xs font-semibold ${
                          bus.seatStatus === 'Full'
                            ? 'bg-rose-500/15 text-rose-100'
                            : 'bg-white/10 text-slate-100'
                        }`}
                      >
                        {bus.seatStatus} seats
                      </span>
                    </div>
                  </div>
                </Link>
              );
            })
          ) : (
            <div className="rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-8 text-center text-slate-400">
              Try a bus number or a stop name that exists in your MongoDB data.
            </div>
          )}
        </section>
      </div>
    </main>
  );
}
