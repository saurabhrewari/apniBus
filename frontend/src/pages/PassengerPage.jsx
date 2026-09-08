import { useState } from 'react';
import { Link, useNavigate } from '../lib/router';
import api from '../lib/api';
import { RECENT_BUSES_KEY, readJson } from '../lib/bus';

export default function PassengerPage() {
  const navigate = useNavigate();
  const [busNumber, setBusNumber] = useState('');
  const [fromStop, setFromStop] = useState('');
  const [toStop, setToStop] = useState('');
  const [nearbyStops, setNearbyStops] = useState([]);
  const [nearbyStatus, setNearbyStatus] = useState('');
  const [recentBuses] = useState(() => readJson(RECENT_BUSES_KEY, []));

  function submitBusSearch(event) {
    event.preventDefault();
    if (busNumber.trim()) {
      navigate(`/search-results?query=${encodeURIComponent(busNumber.trim())}`);
    }
  }

  function submitRouteSearch(event) {
    event.preventDefault();
    const params = new URLSearchParams();
    if (fromStop.trim()) {
      params.set('from', fromStop.trim());
    }
    if (toStop.trim()) {
      params.set('to', toStop.trim());
    }

    if ([...params.keys()].length > 0) {
      navigate(`/search-results?${params.toString()}`);
    }
  }

  function loadNearbyStops() {
    if (!navigator.geolocation) {
      setNearbyStatus('GPS is not supported in this browser.');
      return;
    }

    setNearbyStatus('Finding nearby stations...');
    navigator.geolocation.getCurrentPosition(
      async (position) => {
        try {
          const response = await api.get('/api/search/nearby-stops', {
            params: {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude
            }
          });
          setNearbyStops(response.data.results || []);
          setNearbyStatus('');
        } catch (error) {
          console.error(error);
          setNearbyStatus('Could not load nearby stations from the backend.');
        }
      },
      (error) => {
        setNearbyStatus(error.message || 'Location permission was denied.');
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 }
    );
  }

  return (
    <main className="min-h-screen bg-ink text-mist">
      <div className="mx-auto grid min-h-screen max-w-7xl content-start gap-7 px-4 py-6 sm:px-6 lg:px-8">
        <header className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="text-sm uppercase tracking-[0.32em] text-tide">
              Passenger Dashboard
            </p>
            <h1 className="mt-2 font-display text-4xl text-white sm:text-5xl">
              Search when your bus reaches your stop.
            </h1>
          </div>
          <Link
            to="/"
            className="w-fit rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/10"
          >
            Role Gateway
          </Link>
        </header>

        <section className="grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-glow">
            <form onSubmit={submitRouteSearch}>
              <p className="text-sm font-semibold text-white">From Station to To Station</p>
              <div className="mt-4 grid gap-3 sm:grid-cols-2">
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>From Station</span>
                  <input
                    value={fromStop}
                    onChange={(event) => setFromStop(event.target.value)}
                    placeholder="Rewari Stand"
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-tide/60"
                  />
                </label>
                <label className="grid gap-2 text-sm text-slate-300">
                  <span>To Station</span>
                  <input
                    value={toStop}
                    onChange={(event) => setToStop(event.target.value)}
                    placeholder="Gurgaon"
                    className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-tide/60"
                  />
                </label>
              </div>
              <button
                type="submit"
                className="mt-4 w-full rounded-xl bg-moss px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110"
              >
                Find buses on this route
              </button>
            </form>
          </div>

          <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
            <form onSubmit={submitBusSearch}>
              <p className="text-sm font-semibold text-white">Bus number search</p>
              <div className="mt-4 flex gap-3">
                <input
                  value={busNumber}
                  onChange={(event) => setBusNumber(event.target.value)}
                  placeholder="Bus number"
                  className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none placeholder:text-slate-500 focus:border-tide/60"
                />
                <button
                  type="submit"
                  className="rounded-xl bg-tide px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110"
                >
                  Search
                </button>
              </div>
            </form>

            {recentBuses.length > 0 ? (
              <div className="mt-5">
                <p className="text-sm font-semibold text-white">Recent history</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  {recentBuses.map((item) => (
                    <Link
                      key={item}
                      to={`/search-results?query=${encodeURIComponent(item)}`}
                      className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
                    >
                      {item}
                    </Link>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </section>

        <section className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-white">Nearby stations</p>
              <p className="mt-1 text-sm text-slate-400">
                Use GPS to suggest local boarding points.
              </p>
            </div>
            <button
              type="button"
              onClick={loadNearbyStops}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Nearby Stations
            </button>
          </div>

          {nearbyStatus ? <p className="mt-4 text-sm text-slate-300">{nearbyStatus}</p> : null}
          {nearbyStops.length > 0 ? (
            <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {nearbyStops.map((stop) => (
                <button
                  type="button"
                  key={stop._id}
                  onClick={() => navigate(`/search-results?from=${encodeURIComponent(stop.stopName)}`)}
                  className="rounded-xl border border-white/10 bg-black/20 px-4 py-3 text-left transition hover:border-tide/50 hover:bg-white/10"
                >
                  <p className="font-semibold text-white">{stop.stopName}</p>
                  <p className="mt-1 text-sm text-slate-400">{stop.distanceKm} km away</p>
                </button>
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </main>
  );
}
