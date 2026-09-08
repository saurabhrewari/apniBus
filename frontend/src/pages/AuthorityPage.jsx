import { useEffect, useMemo, useState } from 'react';
import { Link } from '../lib/router';
import { io } from 'socket.io-client';
import { MapContainer, Marker, Popup, TileLayer } from 'react-leaflet';
import api, { AUTH_TOKEN_KEY, clearAuthToken } from '../lib/api';
import { busMarkerIcon } from '../components/BusMarkerIcon';
import MapViewport from '../components/MapViewport';
import { getSeatSummary, mergeLiveBus, normalizeBus } from '../lib/bus';
import { SOCKET_URL } from '../config';

const fallbackCenter = {
  latitude: 28.6139,
  longitude: 77.209
};

function stopName(stop) {
  return stop?.stopName || stop?.name || 'Stop';
}

function formatDateTime(value) {
  if (!value) {
    return 'Not available';
  }

  return new Date(value).toLocaleString();
}

function formatLocation(bus) {
  const latitude = Number(bus?.currentLocation?.latitude);
  const longitude = Number(bus?.currentLocation?.longitude);

  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return 'Location not shared yet';
  }

  return `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`;
}

function formatDelay(bus) {
  const eta = bus?.eta || bus?.lastEta;

  if (!eta) {
    return 'ETA pending';
  }

  if (eta.delayMinutes > 0) {
    return `${eta.delayMinutes} min late`;
  }

  return eta.status || 'On time';
}

export default function AuthorityPage() {
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [adminEmail, setAdminEmail] = useState('');
  const [adminPassword, setAdminPassword] = useState('');
  const [buses, setBuses] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [stops, setStops] = useState([]);
  const [schedules, setSchedules] = useState([]);
  const [analytics, setAnalytics] = useState(null);
  const [dataQuality, setDataQuality] = useState(null);
  const [recentTrips, setRecentTrips] = useState([]);
  const [auditLogs, setAuditLogs] = useState([]);
  const [activeInsightKey, setActiveInsightKey] = useState('active');
  const [filter, setFilter] = useState('');
  const [status, setStatus] = useState('Load fleet data to begin.');
  const [error, setError] = useState('');
  const [assignmentDrafts, setAssignmentDrafts] = useState({});
  const [busForm, setBusForm] = useState({
    busNumber: '',
    model: '',
    busType: 'Standard',
    totalSeats: 30,
    seatsAvailable: 30,
    routeNumber: '',
    assignedDriverId: ''
  });
  const [routeForm, setRouteForm] = useState({
    routeNumber: '',
    origin: '',
    destination: '',
    stopsText: '',
    distancesText: ''
  });
  const [stopForm, setStopForm] = useState({
    stopName: '',
    latitude: '',
    longitude: ''
  });
  const [scheduleForm, setScheduleForm] = useState({
    busNumber: '',
    routeNumber: '',
    rowsText: ''
  });

  async function loadData() {
    try {
      const [
        busResponse,
        routeResponse,
        stopResponse,
        scheduleResponse,
        analyticsResponse,
        dataQualityResponse,
        tripsResponse,
        auditResponse
      ] = await Promise.all([
        api.get('/api/buses'),
        api.get('/api/data/routes'),
        api.get('/api/data/stops'),
        api.get('/api/data/schedules'),
        api.get('/api/analytics/overview'),
        api.get('/api/analytics/data-quality'),
        api.get('/api/operations/trips?limit=25'),
        api.get('/api/operations/audit-logs?limit=6')
      ]);
      setBuses((busResponse.data || []).map(normalizeBus));
      setRoutes(routeResponse.data || []);
      setStops(stopResponse.data || []);
      setSchedules(scheduleResponse.data || []);
      setAnalytics(analyticsResponse.data || null);
      setDataQuality(dataQualityResponse.data || null);
      setRecentTrips(tripsResponse.data?.trips || []);
      setAuditLogs(auditResponse.data?.logs || []);
      setAssignmentDrafts(
        (busResponse.data || []).reduce((drafts, bus) => {
          drafts[bus._id] = {
            routeNumber: bus.route?.routeNumber || bus.routeId || '',
            assignedDriverId: bus.assignedDriverId || ''
          };
          return drafts;
        }, {})
      );
      setStatus('Fleet data loaded.');
      setError('');
    } catch (loadError) {
      console.error(loadError);
      setError('Could not load authority data. Make sure the backend is running.');
    }
  }

  useEffect(() => {
    if (isUnlocked) {
      loadData();
    }
  }, [isUnlocked]);

  useEffect(() => {
    const token = window.localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) {
      return;
    }

    api.get('/api/users/me')
      .then((response) => {
        if (response.data.user?.role === 'authority') {
          setIsUnlocked(true);
          setAdminEmail(response.data.user.email || '');
        } else {
          clearAuthToken();
        }
      })
      .catch(() => {
        clearAuthToken();
      });
  }, []);

  useEffect(() => {
    if (!isUnlocked) {
      return undefined;
    }

    const socket = io(SOCKET_URL, {
      transports: ['websocket', 'polling']
    });

    const applyFleetUpdate = (payload) => {
      if (!payload?.busNumber) {
        return;
      }

      setBuses((currentBuses) => {
        let matched = false;
        const nextBuses = currentBuses.map((bus) => {
          if (bus.busNumber !== payload.busNumber) {
            return bus;
          }

          matched = true;
          return mergeLiveBus(bus, payload);
        });

        return matched ? nextBuses : [mergeLiveBus(null, payload), ...nextBuses];
      });
    };

    socket.on('fleet-state', applyFleetUpdate);
    socket.on('bus-state', applyFleetUpdate);
    socket.on('broadcast-location', applyFleetUpdate);

    return () => socket.disconnect();
  }, [isUnlocked]);

  async function unlock(event) {
    event.preventDefault();
    if (!adminEmail.trim() || !adminPassword.trim()) {
      setError('Enter authority email and password.');
      return;
    }

    try {
      const response = await api.post('/api/users/login', {
        email: adminEmail,
        password: adminPassword
      });
      const user = response.data.user;
      if (user?.role && user.role !== 'authority') {
        setError('This account is not an authority account.');
        return;
      }
      if (response.data.token) {
        window.localStorage.setItem(AUTH_TOKEN_KEY, response.data.token);
      }
      setIsUnlocked(true);
      setError('');
    } catch (loginError) {
      setIsUnlocked(false);
      setError(loginError.response?.data?.msg || 'This username or password is incorrect.');
    }
  }

  function logout() {
    clearAuthToken();
    setIsUnlocked(false);
    setAdminPassword('');
    setBuses([]);
    setRoutes([]);
    setStops([]);
    setSchedules([]);
    setAnalytics(null);
    setDataQuality(null);
    setRecentTrips([]);
    setAuditLogs([]);
    setStatus('Logged out.');
    setError('');
  }

  async function saveBus(event) {
    event.preventDefault();
    try {
      await api.post('/api/buses', {
        ...busForm,
        totalSeats: Number(busForm.totalSeats),
        seatsAvailable: Number(busForm.seatsAvailable)
      });
      setStatus(`Bus ${busForm.busNumber} added.`);
      setBusForm({
        busNumber: '',
        model: '',
        busType: 'Standard',
        totalSeats: 30,
        seatsAvailable: 30,
        routeNumber: '',
        assignedDriverId: ''
      });
      loadData();
    } catch (saveError) {
      console.error(saveError);
      setError(saveError.response?.data?.msg || 'Could not save bus.');
    }
  }

  async function saveStop(event) {
    event.preventDefault();
    try {
      await api.post('/api/data/stops', {
        stopName: stopForm.stopName,
        latitude: Number(stopForm.latitude),
        longitude: Number(stopForm.longitude)
      });
      setStatus(`Stop ${stopForm.stopName} added.`);
      setStopForm({ stopName: '', latitude: '', longitude: '' });
      loadData();
    } catch (stopError) {
      console.error(stopError);
      setError(stopError.response?.data?.msg || 'Could not save stop.');
    }
  }

  async function removeStop(stopId) {
    try {
      await api.delete(`/api/data/stops/${stopId}`);
      setStatus('Stop deleted.');
      loadData();
    } catch (stopError) {
      console.error(stopError);
      setError(stopError.response?.data?.msg || 'Could not delete stop.');
    }
  }

  async function assignBus(bus) {
    try {
      const draft = assignmentDrafts[bus._id] || {};
      await api.patch(`/api/buses/${bus._id}`, {
        routeNumber: draft.routeNumber,
        assignedDriverId: draft.assignedDriverId
      });
      setStatus(`Assignment updated for ${bus.busNumber}.`);
      loadData();
    } catch (assignError) {
      console.error(assignError);
      setError('Could not update this bus assignment.');
    }
  }

  async function removeBus(busId) {
    try {
      await api.delete(`/api/buses/${busId}`);
      setStatus('Bus removed.');
      loadData();
    } catch (deleteError) {
      console.error(deleteError);
      setError('Could not remove bus.');
    }
  }

  async function toggleBus(bus) {
    try {
      await api.patch(`/api/buses/${bus._id}`, { isActive: !bus.isActive });
      setStatus(`${bus.busNumber} ${bus.isActive ? 'deactivated' : 'activated'}.`);
      loadData();
    } catch (toggleError) {
      console.error(toggleError);
      setError('Could not update bus status.');
    }
  }

  async function saveRoute(event) {
    event.preventDefault();
    try {
      const stopsList = routeForm.stopsText
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);
      const segmentDistancesKm = routeForm.distancesText
        .split(',')
        .map((item) => Number(item.trim()))
        .filter(Number.isFinite);

      await api.post('/api/data/routes', {
        routeNumber: routeForm.routeNumber,
        origin: routeForm.origin,
        destination: routeForm.destination,
        stops: stopsList,
        segmentDistancesKm
      });
      setStatus(`Route ${routeForm.routeNumber} saved.`);
      setRouteForm({
        routeNumber: '',
        origin: '',
        destination: '',
        stopsText: '',
        distancesText: ''
      });
      loadData();
    } catch (routeError) {
      console.error(routeError);
      setError(routeError.response?.data?.msg || 'Could not save route.');
    }
  }

  async function removeRoute(routeId) {
    try {
      await api.delete(`/api/data/routes/${routeId}`);
      setStatus('Route deleted.');
      loadData();
    } catch (routeError) {
      console.error(routeError);
      setError(routeError.response?.data?.msg || 'Could not delete route.');
    }
  }

  async function saveSchedule(event) {
    event.preventDefault();
    try {
      const schedulesPayload = scheduleForm.rowsText
        .split('\n')
        .map((row) => row.split(',').map((item) => item.trim()))
        .filter((parts) => parts[0] && parts[1])
        .map(([stopNameValue, arrivalTime, departureTime]) => ({
          stopName: stopNameValue,
          arrivalTime,
          departureTime: departureTime || arrivalTime
        }));

      await api.post('/api/data/schedules', {
        busNumber: scheduleForm.busNumber,
        routeNumber: scheduleForm.routeNumber,
        schedules: schedulesPayload
      });
      setStatus('Schedule saved.');
      setScheduleForm({ busNumber: '', routeNumber: '', rowsText: '' });
      loadData();
    } catch (scheduleError) {
      console.error(scheduleError);
      setError(scheduleError.response?.data?.msg || 'Could not save schedule.');
    }
  }

  const liveBuses = useMemo(
    () =>
      buses.filter(
        (bus) =>
          bus.currentLocation &&
          Number.isFinite(Number(bus.currentLocation.latitude)) &&
          Number.isFinite(Number(bus.currentLocation.longitude))
      ),
    [buses]
  );
  const mapFocus = liveBuses[0]?.currentLocation || fallbackCenter;
  const filteredBuses = useMemo(() => {
    const search = filter.trim().toLowerCase();
    if (!search) {
      return buses;
    }

    return buses.filter((bus) =>
      [bus.busNumber, bus.routeNumber, bus.routeId, bus.assignedDriverId, bus.busType]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(search))
    );
  }, [buses, filter]);

  const issueCount = dataQuality?.totalIssues ?? 0;
  const isOnlineBus = (bus) => bus.liveStatus === 'online';
  const activeBuses = buses.filter((bus) => bus.isActive);
  const onlineBuses = activeBuses.filter(isOnlineBus);
  const offlineBuses = activeBuses.filter((bus) => !isOnlineBus(bus));
  const occupiedBuses = buses.filter((bus) => getSeatSummary(bus).occupiedSeats > 0);
  const availableBuses = buses.filter((bus) => getSeatSummary(bus).seatsAvailable > 0);
  const runningTrips = recentTrips.filter((trip) => trip.status === 'running');

  function busInsight(bus) {
    const seats = getSeatSummary(bus);
    return {
      id: bus._id || bus.busNumber,
      title: bus.busNumber,
      badge: bus.liveStatus || 'offline',
      to: `/authority/bus/${encodeURIComponent(bus.busNumber)}`,
      lines: [
        `Route: ${bus.routeNumber || bus.routeId || 'Not assigned'}`,
        `Driver: ${bus.assignedDriverId || 'Unassigned'}`,
        `Timing: ${formatDelay(bus)}`,
        `Location: ${formatLocation(bus)}`,
        `Seats: ${seats.occupiedSeats}/${seats.totalSeats} occupied, ${seats.seatsAvailable} available`,
        `Last active: ${formatDateTime(bus.lastActiveAt)}`
      ]
    };
  }

  function routeInsight(route) {
    const assignedBuses = buses.filter(
      (bus) => String(bus.route?._id || bus.route) === String(route._id) || bus.routeNumber === route.routeNumber || bus.routeId === route.routeNumber
    );
    return {
      id: route._id,
      title: route.routeNumber,
      badge: route.isActive ? 'active' : 'inactive',
      lines: [
        `${route.origin} to ${route.destination}`,
        `Assigned buses: ${assignedBuses.map((bus) => bus.busNumber).join(', ') || 'None'}`,
        `Drivers: ${assignedBuses.map((bus) => bus.assignedDriverId).filter(Boolean).join(', ') || 'Unassigned'}`,
        `Stops: ${route.stops?.length || 0}`,
        `Distance segments: ${(route.segmentDistancesKm || []).join(', ') || 'Not set'}`
      ]
    };
  }

  function tripInsight(trip) {
    return {
      id: trip._id,
      title: trip.busNumber,
      badge: trip.status,
      to: trip.busNumber ? `/authority/bus/${encodeURIComponent(trip.busNumber)}` : null,
      lines: [
        `Route: ${trip.routeNumber || 'Not assigned'}`,
        `Driver: ${trip.driverId || 'Unknown'}`,
        `Started: ${formatDateTime(trip.startedAt)}`,
        `Last seen: ${formatDateTime(trip.lastSeenAt)}`,
        `GPS updates: ${trip.locationUpdateCount || 0}`,
        `Manual check-ins: ${trip.manualCheckInCount || 0}`
      ]
    };
  }

  function issueInsight(issue, index, key) {
    return {
      id: `${key}-${index}`,
      title: issue.busNumber || issue.routeNumber || issue.stopName || issue.routeName || key,
      badge: key.replace(/([A-Z])/g, ' $1'),
      lines: Object.entries(issue).map(([field, value]) => `${field}: ${String(value)}`)
    };
  }

  function buildInsight(key) {
    const issues = dataQuality?.issues || {};
    const issueItems = Object.entries(issues).flatMap(([issueKey, items]) =>
      items.map((item, index) => issueInsight(item, index, issueKey))
    );

    const insightMap = {
      active: {
        title: 'Active Buses',
        description: 'Buses currently enabled for operations.',
        items: activeBuses.map(busInsight)
      },
      online: {
        title: 'Online Buses',
        description: 'Buses sending live GPS or recently marked online.',
        items: onlineBuses.map(busInsight)
      },
      offline: {
        title: 'Offline Buses',
        description: 'Active buses that are not currently sending live GPS.',
        items: offlineBuses.map(busInsight)
      },
      routes: {
        title: 'Routes',
        description: 'Route list with assigned buses, drivers, stops, and distances.',
        items: routes.map(routeInsight)
      },
      runningTrips: {
        title: 'Running Trips',
        description: 'Trips currently active according to the trip lifecycle records.',
        items: runningTrips.map(tripInsight)
      },
      occupied: {
        title: 'Occupied Seat Buses',
        description: 'Buses where at least one seat is occupied.',
        items: occupiedBuses.map(busInsight)
      },
      available: {
        title: 'Available Seat Buses',
        description: 'Buses where seats are still available.',
        items: availableBuses.map(busInsight)
      },
      quality: {
        title: 'Operations Quality',
        description: 'Data issues that can affect search, ETA, schedules, or assignments.',
        items: issueItems
      }
    };

    return insightMap[key] || insightMap.active;
  }

  const activeInsight = buildInsight(activeInsightKey);
  const metricCards = [
    ['active', 'Active buses', analytics?.activeBuses ?? activeBuses.length],
    ['online', 'Online', analytics?.onlineBuses ?? onlineBuses.length],
    ['offline', 'Offline', analytics?.offlineBuses ?? offlineBuses.length],
    ['routes', 'Routes', analytics?.totalRoutes ?? routes.length],
    ['runningTrips', 'Running trips', analytics?.runningTrips ?? runningTrips.length],
    ['occupied', 'Occupied', analytics?.occupiedSeats ?? buses.reduce((sum, bus) => sum + getSeatSummary(bus).occupiedSeats, 0)],
    ['available', 'Available', analytics?.availableSeats ?? buses.reduce((sum, bus) => sum + getSeatSummary(bus).seatsAvailable, 0)],
    ['quality', 'Operations Quality', issueCount]
  ];

  if (!isUnlocked) {
    return (
      <main className="min-h-screen bg-ink text-mist">
        <div className="mx-auto grid min-h-screen max-w-xl content-center px-4">
          <form onSubmit={unlock} className="rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-glow">
            <p className="text-sm uppercase tracking-[0.32em] text-ember">Authority Portal</p>
            <h1 className="mt-3 font-display text-4xl text-white">Manager access</h1>
            <label className="mt-6 grid gap-2 text-sm text-slate-300">
              <span>Email</span>
              <input
                value={adminEmail}
                onChange={(event) => setAdminEmail(event.target.value)}
                type="email"
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-ember/60"
              />
            </label>
            <label className="mt-4 grid gap-2 text-sm text-slate-300">
              <span>Password</span>
              <input
                value={adminPassword}
                onChange={(event) => setAdminPassword(event.target.value)}
                type="password"
                className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-ember/60"
              />
            </label>
            {error ? <p className="mt-3 text-sm text-rose-200">{error}</p> : null}
            <button type="submit" className="mt-5 w-full rounded-xl bg-ember px-4 py-3 font-semibold text-white">
              Enter Dashboard
            </button>
            <Link to="/" className="mt-4 inline-flex text-sm text-slate-300">Back to gateway</Link>
          </form>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-ink text-mist">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-ember">Authority Dashboard</p>
            <h1 className="mt-2 font-display text-4xl text-white">Fleet, routes, and live overview.</h1>
            <p className="mt-2 text-sm text-slate-300">{status}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={loadData}
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Refresh
            </button>
            <button
              type="button"
              onClick={logout}
              className="rounded-full border border-rose-400/30 bg-rose-500/10 px-5 py-3 text-sm font-semibold text-rose-100 transition hover:bg-rose-500/20"
            >
              Log out
            </button>
            <Link
              to="/"
              className="rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
            >
              Gateway
            </Link>
          </div>
        </header>

        {error ? (
          <div className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        ) : null}

        <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {metricCards.map(([key, label, value]) => (
            <button
              key={key}
              type="button"
              onClick={() => setActiveInsightKey(key)}
              className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:bg-white/10 ${
                activeInsightKey === key
                  ? 'border-tide/60 bg-tide/10'
                  : 'border-white/10 bg-slate-950/70'
              }`}
            >
              <p className="text-xs uppercase tracking-[0.2em] text-slate-400">{label}</p>
              <p className="mt-2 font-display text-2xl text-white">{value}</p>
              <p className="mt-2 text-xs text-slate-500">Click for details</p>
            </button>
          ))}
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">{activeInsight.title}</p>
              <p className="mt-1 text-sm text-slate-400">{activeInsight.description}</p>
            </div>
            <span className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-300">
              {activeInsight.items.length} records
            </span>
          </div>

          {activeInsight.items.length ? (
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              {activeInsight.items.map((item) => {
                const Wrapper = item.to ? Link : 'div';

                return (
                <Wrapper
                  key={item.id}
                  to={item.to}
                  className="rounded-xl border border-white/10 bg-black/20 p-4 transition hover:bg-white/10"
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-white">{item.title}</p>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
                      {item.badge}
                    </span>
                  </div>
                  <div className="mt-3 grid gap-1 text-xs text-slate-400">
                    {item.lines.map((line) => (
                      <p key={line}>{line}</p>
                    ))}
                  </div>
                  {item.to ? (
                    <p className="mt-3 text-xs font-semibold text-tide">Open straight-line location</p>
                  ) : null}
                </Wrapper>
              );
              })}
            </div>
          ) : (
            <p className="mt-4 rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
              No records in this category.
            </p>
          )}
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Operations Quality</p>
              <p className="mt-1 text-sm text-slate-400">
                {dataQuality?.totalIssues
                  ? `${dataQuality.totalIssues} data issue${dataQuality.totalIssues === 1 ? '' : 's'} need attention.`
                  : 'Routes, buses, stops, and schedules look healthy.'}
              </p>
            </div>
            <span
              className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
                dataQuality?.status === 'healthy'
                  ? 'bg-moss/15 text-emerald-100'
                  : 'bg-amber-500/15 text-amber-100'
              }`}
            >
              {dataQuality?.status || 'checking'}
            </span>
          </div>

          {dataQuality?.issues ? (
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
              {Object.entries(dataQuality.issues).map(([key, items]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveInsightKey('quality')}
                  className="rounded-xl border border-white/10 bg-black/20 p-4 text-left transition hover:bg-white/10"
                >
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">
                    {key.replace(/([A-Z])/g, ' $1')}
                  </p>
                  <p className="mt-2 font-display text-2xl text-white">{items.length}</p>
                  {items[0] ? (
                    <p className="mt-2 truncate text-xs text-slate-400">
                      {items[0].busNumber || items[0].routeNumber || items[0].stopName}
                    </p>
                  ) : (
                    <p className="mt-2 text-xs text-emerald-200">No issues</p>
                  )}
                </button>
              ))}
            </div>
          ) : null}
        </section>

        <section className="grid gap-5 xl:grid-cols-2">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">Recent Trips</p>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Operations</span>
            </div>
            <div className="mt-4 grid gap-3">
              {recentTrips.length ? recentTrips.map((trip) => (
                <div key={trip._id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{trip.busNumber}</p>
                      <p className="mt-1 text-xs text-slate-400">
                        {trip.routeNumber || 'No route'} · Driver {trip.driverId || 'Unknown'}
                      </p>
                    </div>
                    <span className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-200">
                      {trip.status}
                    </span>
                  </div>
                  <p className="mt-2 text-xs text-slate-500">
                    {trip.locationUpdateCount || 0} GPS updates · {trip.manualCheckInCount || 0} check-ins
                  </p>
                </div>
              )) : (
                <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                  No trips recorded yet. Start a driver trip to create one.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">Audit Trail</p>
              <span className="text-xs uppercase tracking-[0.2em] text-slate-500">Security</span>
            </div>
            <div className="mt-4 grid gap-3">
              {auditLogs.length ? auditLogs.map((log) => (
                <div key={log._id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="font-semibold text-white">{log.action}</p>
                    <span className="text-xs text-slate-400">{log.actorRole || 'system'}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-400">
                    {log.entityType} {log.entityLabel || log.entityId || ''}
                  </p>
                </div>
              )) : (
                <p className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-slate-400">
                  No audit records yet.
                </p>
              )}
            </div>
          </div>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.95fr_1.05fr]">
          <form onSubmit={saveBus} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Bus Management</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[
                ['busNumber', 'Bus Number'],
                ['model', 'Model'],
                ['busType', 'Type'],
                ['assignedDriverId', 'Driver ID']
              ].map(([key, label]) => (
                <label key={key} className="grid gap-2 text-sm text-slate-300">
                  <span>{label}</span>
                  <input
                    value={busForm[key]}
                    onChange={(event) => setBusForm((form) => ({ ...form, [key]: event.target.value }))}
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-tide/60"
                  />
                </label>
              ))}
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Capacity</span>
                <input
                  value={busForm.totalSeats}
                  onChange={(event) => setBusForm((form) => ({ ...form, totalSeats: event.target.value }))}
                  type="number"
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-tide/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Available Seats</span>
                <input
                  value={busForm.seatsAvailable}
                  onChange={(event) => setBusForm((form) => ({ ...form, seatsAvailable: event.target.value }))}
                  type="number"
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-tide/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300 sm:col-span-2">
                <span>Assigned Route</span>
                <select
                  value={busForm.routeNumber}
                  onChange={(event) => setBusForm((form) => ({ ...form, routeNumber: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-tide/60"
                >
                  <option value="">No route</option>
                  {routes.map((route) => (
                    <option key={route._id} value={route.routeNumber}>
                      {route.routeNumber}: {route.origin} to {route.destination}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <button type="submit" className="mt-4 w-full rounded-xl bg-moss px-4 py-3 font-semibold text-slate-950">
              Add Bus
            </button>
          </form>

          <form onSubmit={saveRoute} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Route Creation</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Route ID</span>
                <input
                  value={routeForm.routeNumber}
                  onChange={(event) => setRouteForm((form) => ({ ...form, routeNumber: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-ember/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Origin</span>
                <input
                  value={routeForm.origin}
                  onChange={(event) => setRouteForm((form) => ({ ...form, origin: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-ember/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Destination</span>
                <input
                  value={routeForm.destination}
                  onChange={(event) => setRouteForm((form) => ({ ...form, destination: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-ember/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Distances km</span>
                <input
                  value={routeForm.distancesText}
                  onChange={(event) => setRouteForm((form) => ({ ...form, distancesText: event.target.value }))}
                  placeholder="4.5, 8, 3"
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-ember/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300 sm:col-span-2">
                <span>Stop sequence</span>
                <input
                  value={routeForm.stopsText}
                  onChange={(event) => setRouteForm((form) => ({ ...form, stopsText: event.target.value }))}
                  placeholder="Stop A, Stop B, Stop C"
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-ember/60"
                />
              </label>
            </div>
            <p className="mt-3 text-xs text-slate-400">
              Known stops: {stops.slice(0, 6).map(stopName).join(', ') || 'Add stops through /api/data/stops'}
            </p>
            <button type="submit" className="mt-4 w-full rounded-xl bg-ember px-4 py-3 font-semibold text-white">
              Save Route
            </button>
            <div className="mt-4 grid max-h-48 gap-2 overflow-y-auto pr-1">
              {routes.map((route) => (
                <div key={route._id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <div>
                    <p className="font-semibold text-white">{route.routeNumber}</p>
                    <p className="text-xs text-slate-400">
                      {route.origin} to {route.destination} · {route.stops?.length || 0} stops
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() =>
                        setRouteForm({
                          routeNumber: route.routeNumber,
                          origin: route.origin,
                          destination: route.destination,
                          stopsText: (route.stops || []).map(stopName).join(', '),
                          distancesText: (route.segmentDistancesKm || []).join(', ')
                        })
                      }
                      className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200"
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => removeRoute(route._id)}
                      className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
                    >
                      Delete
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </form>
        </section>

        <section className="grid gap-5 xl:grid-cols-[0.9fr_1.1fr]">
          <form onSubmit={saveStop} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Stop / Station Management</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Station Name</span>
                <input
                  value={stopForm.stopName}
                  onChange={(event) => setStopForm((form) => ({ ...form, stopName: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-tide/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Latitude</span>
                <input
                  value={stopForm.latitude}
                  onChange={(event) => setStopForm((form) => ({ ...form, latitude: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-tide/60"
                />
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Longitude</span>
                <input
                  value={stopForm.longitude}
                  onChange={(event) => setStopForm((form) => ({ ...form, longitude: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-tide/60"
                />
              </label>
            </div>
            <button type="submit" className="mt-4 w-full rounded-xl bg-tide px-4 py-3 font-semibold text-slate-950">
              Add Station
            </button>

            <div className="mt-4 grid max-h-56 gap-2 overflow-y-auto pr-1">
              {stops.map((stop) => (
                <div key={stop._id} className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-black/20 px-4 py-3">
                  <div>
                    <p className="font-semibold text-white">{stopName(stop)}</p>
                    <p className="text-xs text-slate-400">
                      {stop.coordinates?.latitude ?? '-'}, {stop.coordinates?.longitude ?? '-'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeStop(stop._id)}
                    className="rounded-full border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
                  >
                    Delete
                  </button>
                </div>
              ))}
            </div>
          </form>

          <form onSubmit={saveSchedule} className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Schedule Management</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Bus</span>
                <select
                  value={scheduleForm.busNumber}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, busNumber: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-moss/60"
                >
                  <option value="">Choose bus</option>
                  {buses.map((bus) => (
                    <option key={bus._id} value={bus.busNumber}>{bus.busNumber}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-300">
                <span>Route</span>
                <select
                  value={scheduleForm.routeNumber}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, routeNumber: event.target.value }))}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none focus:border-moss/60"
                >
                  <option value="">Choose route</option>
                  {routes.map((route) => (
                    <option key={route._id} value={route.routeNumber}>{route.routeNumber}</option>
                  ))}
                </select>
              </label>
              <label className="grid gap-2 text-sm text-slate-300 sm:col-span-2">
                <span>Rows: stop, arrival, departure</span>
                <textarea
                  value={scheduleForm.rowsText}
                  onChange={(event) => setScheduleForm((form) => ({ ...form, rowsText: event.target.value }))}
                  placeholder={'Rewari Stand, 08:00, 08:05\nDharuhera, 08:30, 08:32'}
                  rows={5}
                  className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-moss/60"
                />
              </label>
            </div>
            <button type="submit" className="mt-4 w-full rounded-xl bg-moss px-4 py-3 font-semibold text-slate-950">
              Save Schedule
            </button>
            <p className="mt-3 text-xs text-slate-400">{schedules.length} schedule rows saved.</p>
          </form>
        </section>

        <section className="grid gap-5 xl:grid-cols-[1fr_1fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <p className="text-sm font-semibold text-white">Assignments</p>
              <input
                value={filter}
                onChange={(event) => setFilter(event.target.value)}
                placeholder="Search buses, routes, drivers"
                className="min-w-64 rounded-xl border border-white/10 bg-black/30 px-4 py-2 text-sm text-white outline-none placeholder:text-slate-500"
              />
            </div>
            <div className="mt-4 grid max-h-96 gap-3 overflow-y-auto pr-1">
              {filteredBuses.map((bus) => {
                const seats = getSeatSummary(bus);

                return (
                <div key={bus._id} className="rounded-xl border border-white/10 bg-black/20 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-white">{bus.busNumber}</p>
                      <p className="mt-1 text-sm text-slate-400">
                        {bus.busType || 'Standard'} · Driver {bus.assignedDriverId || 'Unassigned'}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Route {bus.route?.routeNumber || bus.routeId || 'Unassigned'}
                      </p>
                      <p className="mt-1 text-sm text-slate-400">
                        Seats {seats.occupiedSeats}/{seats.totalSeats} · {bus.liveStatus || 'offline'} · {bus.isActive ? 'Active' : 'Inactive'}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto_auto]">
                    <select
                      value={assignmentDrafts[bus._id]?.routeNumber || ''}
                      onChange={(event) =>
                        setAssignmentDrafts((drafts) => ({
                          ...drafts,
                          [bus._id]: {
                            ...drafts[bus._id],
                            routeNumber: event.target.value
                          }
                        }))
                      }
                      className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none"
                    >
                      <option value="">No route</option>
                      {routes.map((route) => (
                        <option key={route._id} value={route.routeNumber}>
                          {route.routeNumber}
                        </option>
                      ))}
                    </select>
                    <input
                      value={assignmentDrafts[bus._id]?.assignedDriverId || ''}
                      onChange={(event) =>
                        setAssignmentDrafts((drafts) => ({
                          ...drafts,
                          [bus._id]: {
                            ...drafts[bus._id],
                            assignedDriverId: event.target.value
                          }
                        }))
                      }
                      placeholder="Driver ID"
                      className="rounded-xl border border-white/10 bg-slate-950 px-3 py-2 text-sm text-white outline-none placeholder:text-slate-500"
                    />
                    <button
                      type="button"
                      onClick={() => assignBus(bus)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200"
                    >
                      Assign
                    </button>
                    <button
                      type="button"
                      onClick={() => toggleBus(bus)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs text-slate-200"
                    >
                      {bus.isActive ? 'Deactivate' : 'Activate'}
                    </button>
                    <button
                      type="button"
                      onClick={() => removeBus(bus._id)}
                      className="rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-xs text-rose-100"
                    >
                      Remove
                    </button>
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <p className="text-sm font-semibold text-white">Live Overview</p>
            <div className="mt-4 h-96 overflow-hidden rounded-xl border border-white/10">
              <MapContainer
                center={[mapFocus.latitude, mapFocus.longitude]}
                zoom={11}
                className="h-full w-full"
                scrollWheelZoom
              >
                <TileLayer
                  attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                  url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                />
                {liveBuses.map((bus) => (
                  <Marker
                    key={bus._id}
                    position={[
                      Number(bus.currentLocation.latitude),
                      Number(bus.currentLocation.longitude)
                    ]}
                    icon={busMarkerIcon}
                  >
                    <Popup>
                      <div className="space-y-1 text-sm">
                        <p className="font-semibold">{bus.busNumber}</p>
                        <p>{bus.route?.routeNumber || bus.routeId || 'No route'}</p>
                      </div>
                    </Popup>
                  </Marker>
                ))}
                <MapViewport focus={mapFocus} />
              </MapContainer>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
