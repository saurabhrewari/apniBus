import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { io } from 'socket.io-client';
import api from '../lib/api';
import { getSeatSummary, mergeLiveBus, normalizeBus, stopLabel } from '../lib/bus';
import { SOCKET_URL } from '../config';

const defaultStatus = 'Choose a bus and tap Start Trip.';

function isStopPassed(index, bus) {
  const currentIndex = Number(bus?.currentStopIndex) || 0;
  return index < currentIndex;
}

function getProgressPercent(bus, stopCount) {
  if (stopCount <= 1) {
    return 0;
  }

  const currentIndex = Math.min(Number(bus?.currentStopIndex) || 0, stopCount - 1);
  return (currentIndex / (stopCount - 1)) * 100;
}

export default function DriverPage() {
  const socketRef = useRef(null);
  const watchIdRef = useRef(null);
  const lastTimestampRef = useRef('');

  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [driverId, setDriverId] = useState('');
  const [driverPin, setDriverPin] = useState('');
  const [isDriverUnlocked, setIsDriverUnlocked] = useState(false);
  const [selectedBusNumber, setSelectedBusNumber] = useState('');
  const [selectedRouteNumber, setSelectedRouteNumber] = useState('');
  const [isSharing, setIsSharing] = useState(false);
  const [status, setStatus] = useState(defaultStatus);
  const [connectionState, setConnectionState] = useState('offline');
  const [lastLocation, setLastLocation] = useState(null);
  const [speedKmph, setSpeedKmph] = useState(null);
  const [seatState, setSeatState] = useState(null);
  const [error, setError] = useState('');

  async function loadBuses() {
    try {
      const response = await api.get('/api/buses');
      const normalizedBuses = (response.data || []).map(normalizeBus);
      setBuses(normalizedBuses);
      setError('');

      if (!selectedBusNumber && normalizedBuses.length > 0) {
        setSelectedBusNumber(normalizedBuses[0].busNumber);
        setSeatState(getSeatSummary(normalizedBuses[0]));
        setSelectedRouteNumber(
          normalizedBuses[0].route?.routeNumber || normalizedBuses[0].routeId || ''
        );
      }
    } catch (loadError) {
      console.error(loadError);
      setError('Could not load buses. Make sure the backend is running.');
    }
  }

  async function loadRoutes() {
    try {
      const response = await api.get('/api/data/routes');
      setRoutes(response.data || []);
    } catch (loadError) {
      console.error(loadError);
      setError('Could not load routes. Add routes in MongoDB or through /api/data/routes.');
    }
  }

  useEffect(() => {
    if (isDriverUnlocked) {
      loadBuses();
      loadRoutes();
    }
  }, [isDriverUnlocked]);

  useEffect(() => {
    return () => {
      stopTrip(true);
    };
  }, []);

  function ensureSocket() {
    if (socketRef.current) {
      if (!socketRef.current.connected) {
        socketRef.current.connect();
      }

      return socketRef.current;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000
    });

    socket.on('connect', () => {
      setConnectionState('online');
      setError('');
    });

    socket.on('disconnect', () => {
      setConnectionState('offline');
    });

    socket.on('connect_error', () => {
      setConnectionState('offline');
      setError('Socket connection failed. Check the backend server and try again.');
    });

    socket.on('location-error', (payload) => {
      setError(payload?.msg || 'Location update failed.');
      setStatus('Unable to sync this location update.');
    });

    socket.on('check-in-confirmed', (payload) => {
      setStatus(payload?.landmark || 'Manual stop check-in synced.');
      if (payload?.busNumber === selectedBusNumber) {
        setBuses((currentBuses) =>
          currentBuses.map((bus) =>
            bus.busNumber === payload.busNumber ? mergeLiveBus(bus, payload) : bus
          )
        );
      }
    });

    socket.on('seat-updated', (payload) => {
      if (payload?.busNumber === selectedBusNumber) {
        setSeatState(getSeatSummary(payload));
        setStatus('Seat availability synced.');
      }
    });

    socket.on('bus-state', (payload) => {
      if (payload?.busNumber === selectedBusNumber) {
        setSeatState(getSeatSummary(payload));
        setBuses((currentBuses) =>
          currentBuses.map((bus) =>
            bus.busNumber === payload.busNumber ? mergeLiveBus(bus, payload) : bus
          )
        );
      }
    });

    socket.on('route-location', (payload) => {
      if (payload?.busNumber === selectedBusNumber) {
        setBuses((currentBuses) =>
          currentBuses.map((bus) =>
            bus.busNumber === payload.busNumber ? mergeLiveBus(bus, payload) : bus
          )
        );
      }
    });

    socketRef.current = socket;
    return socket;
  }

  function stopTrip(silent = false) {
    if (socketRef.current && selectedBusNumber) {
      socketRef.current.emit('stop-trip', {
        driverId: driverId.trim(),
        busNumber: selectedBusNumber,
        routeNumber: selectedRouteNumber
      });
    }

    if (watchIdRef.current !== null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }

    if (socketRef.current) {
      socketRef.current.disconnect();
      socketRef.current = null;
    }

    setIsSharing(false);
    setConnectionState('offline');

    if (!silent) {
      setStatus('Trip stopped. Location sharing is off.');
    }
  }

  function startTrip() {
    if (!driverId.trim()) {
      setError('Please enter your driver ID first.');
      return;
    }

    if (!selectedBusNumber) {
      setError('Please select a bus first.');
      return;
    }

    if (!selectedRouteNumber) {
      setError('Please select a Route ID first.');
      return;
    }

    if (!navigator.geolocation) {
      setError('Geolocation is not supported in this browser.');
      return;
    }

    if (watchIdRef.current !== null) {
      setStatus('Location is already sharing...');
      return;
    }

    setError('');
    setStatus('Waiting for GPS fix...');
    setIsSharing(true);

    const socket = ensureSocket();

    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const payload = {
          driverId: driverId.trim(),
          busNumber: selectedBusNumber,
          routeNumber: selectedRouteNumber,
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          speedKmph: Number.isFinite(position.coords.speed)
            ? Math.max(0, position.coords.speed * 3.6)
            : null
        };

        lastTimestampRef.current = new Date().toLocaleTimeString();
        setLastLocation(payload);
        setSpeedKmph(payload.speedKmph);
        setStatus('Location is sharing...');
        socket.emit('send-location', payload);
      },
      (geoError) => {
        console.error(geoError);
        setError(geoError.message);
        setStatus('Location permission failed or GPS is unavailable.');
        stopTrip(true);
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 0
      }
    );
  }

  const selectedBus = useMemo(
    () => buses.find((bus) => bus.busNumber === selectedBusNumber) || null,
    [buses, selectedBusNumber]
  );

  const selectedRoute = useMemo(
    () =>
      routes.find((route) => route.routeNumber === selectedRouteNumber) ||
      selectedBus?.route ||
      null,
    [routes, selectedBus, selectedRouteNumber]
  );

  const routeStops = selectedRoute?.stops?.length ? selectedRoute.stops : selectedBus?.stops || [];
  const nextStopIndex = Math.min(Number(selectedBus?.currentStopIndex) || 0, Math.max(routeStops.length - 1, 0));
  const nextStop = routeStops[nextStopIndex];
  const seats = seatState || getSeatSummary(selectedBus);
  const progressPercent = getProgressPercent(selectedBus, routeStops.length);
  const eta = selectedBus?.eta || selectedBus?.lastEta;

  useEffect(() => {
    if (selectedBus) {
      setSeatState(getSeatSummary(selectedBus));
    }
  }, [selectedBus?._id, selectedBus?.occupiedSeats, selectedBus?.seatsAvailable, selectedBus?.totalSeats]);

  function manualCheckIn() {
    if (!socketRef.current || !selectedBusNumber || !routeStops.length) {
      setError('Start the trip before using manual check-in.');
      return;
    }

    const checkedIndex = Math.max(nextStopIndex, 0);
    socketRef.current.emit('manual-check-in', {
      busNumber: selectedBusNumber,
      routeNumber: selectedRouteNumber,
      stopIndex: checkedIndex
    });
    setStatus(`Manual check-in sent for ${stopLabel(routeStops[checkedIndex])}.`);
  }

  function updateSeats(deltaOrValue, mode = 'delta') {
    if (!socketRef.current || !selectedBusNumber) {
      setError('Start the trip before updating seats.');
      return;
    }

    const payload = {
      busNumber: selectedBusNumber,
      routeNumber: selectedRouteNumber,
      totalSeats: seats.totalSeats
    };

    if (mode === 'value') {
      payload.occupiedSeats = deltaOrValue;
    } else {
      payload.delta = deltaOrValue;
    }

    socketRef.current.emit('seat-update', payload);
  }

  function unlockDriver(event) {
    event.preventDefault();
    if (!driverId.trim() || !driverPin.trim()) {
      setError('Driver ID and PIN are required.');
      return;
    }

    api.post('/api/users/login', {
      email: driverId.includes('@') ? driverId : `${driverId}@apnibus.local`,
      password: driverPin
    })
      .then((response) => {
        if (response.data.user?.role && response.data.user.role !== 'driver') {
          setError('This account is not a driver account.');
          return;
        }
        if (response.data.token) {
          window.localStorage.setItem('apnibus.authToken', response.data.token);
        }
        setError('');
        setIsDriverUnlocked(true);
      })
      .catch((loginError) => {
        console.error(loginError);
        setIsDriverUnlocked(false);
        setError(loginError.response?.data?.msg || 'Driver ID or password is incorrect.');
      });
  }

  if (!isDriverUnlocked) {
    return (
      <main className="min-h-screen bg-ink text-mist">
        <div className="mx-auto grid min-h-screen max-w-xl content-center px-4">
          <form onSubmit={unlockDriver} className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-glow">
            <p className="text-sm uppercase tracking-[0.32em] text-moss">Driver Login</p>
            <h1 className="mt-3 font-display text-4xl text-white">Start your shift</h1>
            <label className="mt-6 grid gap-2 text-sm text-slate-300">
              <span>Driver ID</span>
              <input
                value={driverId}
                onChange={(event) => setDriverId(event.target.value)}
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-moss/60"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm text-slate-300">
              <span>PIN</span>
              <input
                value={driverPin}
                onChange={(event) => setDriverPin(event.target.value)}
                type="password"
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-moss/60"
              />
            </label>
            {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
            <button type="submit" className="mt-5 w-full rounded-xl bg-moss px-4 py-3 font-semibold text-slate-950">
              Enter Driver Console
            </button>
            <Link to="/" className="mt-4 inline-flex text-sm text-slate-300">Back to gateway</Link>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-mist">
      <div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-6 py-8 lg:px-10">
        <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.35em] text-moss">
              Driver Control
            </p>
            <h1 className="mt-2 font-display text-4xl text-white">
              Share route-aware bus status live.
            </h1>
          </div>
          <Link
            to="/"
            className="inline-flex w-fit rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white transition hover:bg-white/10"
          >
            Back Home
          </Link>
        </header>

        <section className="grid gap-6 lg:grid-cols-[1.05fr_0.95fr]">
          <div className="glass-panel rounded-[2rem] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-sm uppercase tracking-[0.3em] text-tide">
                  Trip Controls
                </p>
                <h2 className="mt-3 font-display text-2xl text-white">
                  Pick a bus and start streaming.
                </h2>
              </div>
              <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs uppercase tracking-[0.25em] text-slate-300">
                Socket {connectionState}
              </span>
            </div>

            <div className="mt-8 grid gap-5">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Driver ID</span>
                <input
                  value={driverId}
                  onChange={(event) => setDriverId(event.target.value)}
                  disabled={isSharing}
                  placeholder="Driver login or staff ID"
                  className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-base text-white outline-none ring-0 transition placeholder:text-slate-500 focus:border-tide/60"
                />
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Select bus</span>
                <select
                  value={selectedBusNumber}
                  onChange={(event) => {
                    const nextBus = buses.find((bus) => bus.busNumber === event.target.value);
                    setSelectedBusNumber(event.target.value);
                    setSelectedRouteNumber(nextBus?.route?.routeNumber || nextBus?.routeId || selectedRouteNumber);
                  }}
                  disabled={isSharing}
                  className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-base text-white outline-none ring-0 transition focus:border-tide/60"
                >
                  <option value="">Choose a bus</option>
                  {buses.map((bus) => (
                    <option key={bus._id} value={bus.busNumber}>
                      {bus.busNumber} {bus.routeId ? `- ${bus.routeId}` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-2 text-sm text-slate-300">
                <span>Select Route ID</span>
                <select
                  value={selectedRouteNumber}
                  onChange={(event) => setSelectedRouteNumber(event.target.value)}
                  disabled={isSharing}
                  className="rounded-2xl border border-white/10 bg-slate-950/80 px-4 py-4 text-base text-white outline-none ring-0 transition focus:border-tide/60"
                >
                  <option value="">Choose a route</option>
                  {routes.map((route) => (
                    <option key={route._id} value={route.routeNumber}>
                      {route.routeNumber}: {route.origin} to {route.destination}
                    </option>
                  ))}
                </select>
              </label>

              <div className="grid gap-3 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={startTrip}
                  disabled={isSharing || buses.length === 0}
                  className="rounded-2xl bg-moss px-5 py-4 text-base font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Start Trip
                </button>
                <button
                  type="button"
                  onClick={() => stopTrip()}
                  disabled={!isSharing}
                  className="rounded-2xl bg-rose-500 px-5 py-4 text-base font-semibold text-white transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  Stop Trip
                </button>
              </div>

              <button
                type="button"
                onClick={() => {
                  loadBuses();
                  loadRoutes();
                }}
                className="w-fit rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm font-medium text-slate-200 transition hover:bg-white/10"
              >
                Refresh data
              </button>
            </div>
          </div>

          <div className="grid gap-6">
            <div className="glass-panel rounded-[2rem] p-6 sm:p-8">
              <p className="text-sm uppercase tracking-[0.3em] text-ember">
                Share Status
              </p>
              <h2 className="mt-3 font-display text-2xl text-white">
                {status}
              </h2>
              <p className="mt-3 max-w-lg text-slate-300">
                Keep this page open on the driver device. GPS updates are linked
                to the selected route so passengers see stop progress and ETA.
              </p>

              {error ? (
                <div className="mt-5 rounded-2xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
                  {error}
                </div>
              ) : null}
            </div>

            <div className="glass-panel rounded-[2rem] p-6 sm:p-8">
              <p className="text-sm uppercase tracking-[0.3em] text-tide">
                Route Accuracy
              </p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    Current speed
                  </p>
                  <p className="mt-2 font-semibold text-white">
                    {Number.isFinite(speedKmph) ? `${speedKmph.toFixed(1)} km/h` : 'Waiting for GPS'}
                  </p>
                </div>
                <div className="rounded-2xl border border-white/10 bg-black/20 p-4">
                  <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                    Next stop
                  </p>
                  <p className="mt-2 font-semibold text-white">
                    {nextStop ? stopLabel(nextStop) : 'Route not selected'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={manualCheckIn}
                disabled={!isSharing || !nextStop}
                className="mt-4 w-full rounded-2xl bg-tide px-5 py-4 text-base font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                Manual Check-in
              </button>

              <div className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
                      Seat Management
                    </p>
                    <p className="mt-2 font-semibold text-white">
                      {seats.occupiedSeats}/{seats.totalSeats} occupied
                    </p>
                    <p className="mt-1 text-sm text-slate-400">
                      {seats.seatsAvailable} available · {seats.seatStatus}
                    </p>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => updateSeats(-1)}
                      disabled={!isSharing || seats.occupiedSeats <= 0}
                      className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 font-semibold text-white disabled:opacity-50"
                    >
                      -1
                    </button>
                    <button
                      type="button"
                      onClick={() => updateSeats(1)}
                      disabled={!isSharing || seats.occupiedSeats >= seats.totalSeats}
                      className="rounded-xl bg-moss px-4 py-3 font-semibold text-slate-950 disabled:opacity-50"
                    >
                      +1
                    </button>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  <button
                    type="button"
                    onClick={() => updateSeats(0, 'value')}
                    disabled={!isSharing}
                    className="rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 disabled:opacity-50"
                  >
                    Mark Empty
                  </button>
                  <button
                    type="button"
                    onClick={() => updateSeats(seats.totalSeats, 'value')}
                    disabled={!isSharing}
                    className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-2 text-sm text-rose-100 disabled:opacity-50"
                  >
                    Mark Full
                  </button>
                </div>
              </div>

              {lastLocation ? (
                <div className="mt-4 space-y-3 text-slate-200">
                  <p>
                    <span className="text-slate-400">Bus:</span>{' '}
                    {lastLocation.busNumber}
                  </p>
                  <p>
                    <span className="text-slate-400">Latitude:</span>{' '}
                    {lastLocation.latitude.toFixed(6)}
                  </p>
                  <p>
                    <span className="text-slate-400">Longitude:</span>{' '}
                    {lastLocation.longitude.toFixed(6)}
                  </p>
                  <p>
                    <span className="text-slate-400">Last sent:</span>{' '}
                    {lastTimestampRef.current}
                  </p>
                </div>
              ) : (
                <p className="mt-4 text-slate-400">
                  No coordinates sent yet. Start the trip to begin live sharing.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-[2rem] p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm uppercase tracking-[0.3em] text-moss">
                Route Line
              </p>
              <h2 className="mt-3 font-display text-2xl text-white">
                Stop-by-stop progress
              </h2>
            </div>
            <span className="rounded-full border border-white/10 bg-black/20 px-3 py-2 text-xs text-slate-300">
              {routeStops.length} stops
            </span>
          </div>

          {routeStops.length ? (
            <div className="relative mt-6 pl-12">
              <div className="absolute left-[1.55rem] top-2 h-[calc(100%-1rem)] w-1 rounded-full bg-white/10" />
              <div
                className="absolute left-[1.55rem] top-2 w-1 rounded-full bg-moss transition-all"
                style={{ height: `calc(${progressPercent}% - 0.5rem)` }}
              />
              {routeStops.map((stop, index) => {
                const passed = isStopPassed(index, selectedBus);
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
                          {passed ? 'Passed' : isNextStop ? 'Arriving next' : 'Upcoming'}
                        </span>
                      </div>
                      <div className="mt-3 grid gap-2 text-xs text-slate-400 sm:grid-cols-2">
                        <span>ETA: {estimatedText}</span>
                        <span>Status: {isNextStop ? eta?.status || 'Waiting' : passed ? 'Done' : 'Not reached'}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-2xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
              Select a route with stops to see the straight route line.
            </p>
          )}
        </section>
      </div>
    </main>
  );
}
