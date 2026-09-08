import { useEffect, useState } from 'react';
import { Link, useSearchParams } from '../lib/router';
import { io } from 'socket.io-client';
import RouteDetails from '../components/RouteDetails';
import api from '../lib/api';
import { CACHED_ROUTE_KEY, cacheRoute, mergeLiveBus, normalizeBus, readJson } from '../lib/bus';
import { SOCKET_URL } from '../config';

export default function LiveStatusPage() {
  const [searchParams] = useSearchParams();
  const busNumber = searchParams.get('bus') || '';
  const [bus, setBus] = useState(() => normalizeBus(readJson(CACHED_ROUTE_KEY, null)));
  const [status, setStatus] = useState('Loading live status...');
  const [connectionState, setConnectionState] = useState('connecting');
  const [error, setError] = useState('');

  async function loadBus() {
    if (!busNumber) {
      setError('No bus selected.');
      return;
    }

    try {
      const response = await api.get('/api/search', { params: { query: busNumber } });
      const selected = (response.data.results || [])
        .map(normalizeBus)
        .find((item) => item.busNumber === busNumber) || normalizeBus(response.data.results?.[0]);

      if (selected) {
        setBus(selected);
        cacheRoute(selected);
        setStatus('Live status ready.');
        setError('');
      } else {
        setStatus('No bus found for this number.');
      }
    } catch (loadError) {
      console.error(loadError);
      setError('Could not load live status. Make sure the backend is running.');
    }
  }

  useEffect(() => {
    loadBus();
  }, [busNumber]);

  useEffect(() => {
    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    socket.on('connect', () => {
      setConnectionState('online');
      setError('');
      const routeKey = bus?.routeNumber || bus?.routeId;
      if (routeKey) {
        socket.emit('join-route', routeKey);
      }
    });

    socket.on('disconnect', () => {
      setConnectionState('offline');
    });

    socket.on('connect_error', () => {
      setConnectionState('offline');
      setError('Socket connection failed.');
    });

    const applyUpdate = (payload) => {
      if (payload?.busNumber !== busNumber) {
        return;
      }

      setBus((current) => {
        const updated = mergeLiveBus(current, payload);
        cacheRoute(updated);
        return updated;
      });
      setStatus(`Live update received for ${payload.busNumber}.`);
    };

    socket.on('route-location', applyUpdate);
    socket.on('broadcast-location', applyUpdate);
    socket.on('update-location', applyUpdate);

    return () => {
      socket.disconnect();
    };
  }, [bus?.routeNumber, bus?.routeId, busNumber]);

  return (
    <main className="min-h-screen bg-ink text-mist">
      <div className="mx-auto grid max-w-6xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-tide">
              Live Status
            </p>
            <h1 className="mt-2 font-display text-4xl text-white">
              {bus?.busNumber || busNumber || 'Selected bus'}
            </h1>
            <p className="mt-2 text-sm text-slate-300">
              {status} Socket {connectionState}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Link
              to="/search-results"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Results
            </Link>
            <Link
              to="/"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              New Search
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <RouteDetails bus={bus} onRefresh={loadBus} />
      </div>
    </main>
  );
}
