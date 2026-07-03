import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../lib/api';
import { getSeatSummary, mergeLiveBus, normalizeBus, stopLabel } from '../lib/bus';
import { SOCKET_URL } from '../config';

function isStopPassed(index, bus) {
  const currentIndex = Number(bus?.currentStopIndex) || 0;
  return index < currentIndex;
}

function getProgressPercent(bus) {
  const stopCount = bus?.stops?.length || 0;
  if (stopCount <= 1) {
    return 0;
  }

  const currentIndex = Math.min(Number(bus?.currentStopIndex) || 0, stopCount - 1);
  return (currentIndex / (stopCount - 1)) * 100;
}

function formatLocation(bus) {
  const latitude = Number(bus?.currentLocation?.latitude);
  const longitude = Number(bus?.currentLocation?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'Location not shared yet';
  }

  return `${latitude.toFixed(6)}, ${longitude.toFixed(6)}`;
}

function formatTime(value) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
}

export default function AuthorityBusStatusPage() {
  const { busNumber = '' } = useParams();
  const decodedBusNumber = decodeURIComponent(busNumber);
  const [bus, setBus] = useState(null);
  const [status, setStatus] = useState('Loading bus status...');
  const [connectionState, setConnectionState] = useState('connecting');
  const [error, setError] = useState('');

  async function loadBus() {
    try {
      const response = await api.get('/api/search', { params: { query: decodedBusNumber } });
      const selected = (response.data.results || [])
        .map(normalizeBus)
        .find((item) => item.busNumber === decodedBusNumber) || null;

      if (!selected) {
        setBus(null);
        setStatus('Bus not found.');
        return;
      }

      setBus(selected);
      setStatus('Bus status loaded.');
      setError('');
    } catch (loadError) {
      console.error(loadError);
      setError('Could not load this bus. Make sure the backend is running.');
    }
  }

  useEffect(() => {
    loadBus();
  }, [decodedBusNumber]);

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
      if (payload?.busNumber !== decodedBusNumber) {
        return;
      }

      setBus((current) => mergeLiveBus(current, payload));
      setStatus(`Live update received for ${payload.busNumber}.`);
    };

    socket.on('route-location', applyUpdate);
    socket.on('bus-state', applyUpdate);
    socket.on('fleet-state', applyUpdate);
    socket.on('broadcast-location', applyUpdate);
    socket.on('update-location', applyUpdate);

    return () => socket.disconnect();
  }, [bus?.routeNumber, bus?.routeId, decodedBusNumber]);

  const eta = bus?.eta || bus?.lastEta;
  const seats = getSeatSummary(bus);
  const progressPercent = useMemo(() => getProgressPercent(bus), [bus]);
  const nextStopIndex = Math.min(Number(bus?.currentStopIndex) || 0, Math.max((bus?.stops?.length || 1) - 1, 0));

  return (
    <main className="min-h-screen bg-ink text-mist">
      <div className="mx-auto grid max-w-5xl gap-5 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-ember">Authority Bus View</p>
            <h1 className="mt-2 font-display text-4xl text-white">{decodedBusNumber}</h1>
            <p className="mt-2 text-sm text-slate-300">
              {status} Socket {connectionState}.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadBus}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Refresh
            </button>
            <Link
              to="/authority"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Authority
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        {bus ? (
          <>
            <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['Route', bus.routeNumber || bus.routeId || 'Not assigned'],
                ['Driver', bus.assignedDriverId || 'Unassigned'],
                ['Location', formatLocation(bus)],
                ['Last Active', formatTime(bus.lastActiveAt)],
                ['ETA', eta?.etaMinutes ? `${eta.etaMinutes} min` : 'Waiting'],
                ['Timing', eta?.delayMinutes > 0 ? `${eta.delayMinutes} min late` : eta?.status || 'On time'],
                ['Seats', `${seats.occupiedSeats}/${seats.totalSeats} occupied`],
                ['Status', bus.liveStatus || 'offline']
              ].map(([label, value]) => (
                <div key={label} className="rounded-2xl border border-white/10 bg-slate-950/70 p-4">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
                  <p className="mt-2 text-sm font-semibold text-white">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold text-white">Straight Route Location</p>
                  <p className="mt-1 text-sm text-slate-400">
                    Bus movement is shown stop-by-stop without map view.
                  </p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
                  {bus.stops?.length || 0} stops
                </span>
              </div>

              {bus.stops?.length ? (
                <div className="relative mt-6 pl-12">
                  <div className="absolute left-[1.55rem] top-2 h-[calc(100%-1rem)] w-1 rounded-full bg-white/10" />
                  <div
                    className="absolute left-[1.55rem] top-2 w-1 rounded-full bg-moss transition-all"
                    style={{ height: `calc(${progressPercent}% - 0.5rem)` }}
                  />
                  {bus.stops.map((stop, index) => {
                    const passed = isStopPassed(index, bus);
                    const isNextStop = index === nextStopIndex;
                    const estimatedText = isNextStop && eta?.etaMinutes !== undefined
                      ? `${eta.etaMinutes} min`
                      : passed
                        ? 'Passed'
                        : 'Pending';

                    return (
                      <div key={stop._id || `${stopLabel(stop)}-${index}`} className="relative pb-6 last:pb-0">
                        <span
                          className={`absolute -left-[2.05rem] top-0 grid h-7 w-7 place-items-center rounded-full border text-[10px] font-bold ${
                            isNextStop
                              ? 'border-tide bg-tide text-slate-950'
                              : passed
                                ? 'border-moss bg-moss text-slate-950'
                                : 'border-white/15 bg-slate-900 text-slate-300'
                          }`}
                        >
                          {isNextStop ? 'BUS' : index + 1}
                        </span>
                        <div className="rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <p className="font-semibold text-white">{stopLabel(stop)}</p>
                            <span className="text-xs text-slate-400">
                              {passed ? 'Passed' : isNextStop ? 'Bus is here / next' : 'Upcoming'}
                            </span>
                          </div>
                          <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-3">
                            <span>Estimated: {estimatedText}</span>
                            <span>Status: {isNextStop ? eta?.status || 'Waiting' : passed ? 'Done' : 'Not reached'}</span>
                            <span>Next stop: {isNextStop ? eta?.nextStopName || stopLabel(stop) : '-'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                  This bus does not have route stops assigned yet.
                </p>
              )}
            </section>
          </>
        ) : (
          <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-8 text-center text-slate-400">
            No bus data available.
          </section>
        )}
      </div>
    </main>
  );
}
