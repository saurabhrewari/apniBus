import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../lib/api';

const roles = [
  {
    title: 'Passenger',
    label: 'Search and tracking',
    copy: 'Find buses by station, bus number, nearby stops, and open the live vertical route status.',
    to: '/passenger',
    accent: 'text-tide',
    border: 'hover:border-tide/50'
  },
  {
    title: 'Driver',
    label: 'Operator console',
    copy: 'Log in, choose the assigned bus and route, stream GPS, and confirm stops manually.',
    to: '/driver',
    accent: 'text-moss',
    border: 'hover:border-moss/50'
  },
  {
    title: 'Authority',
    label: 'Fleet manager',
    copy: 'Manage buses, create routes, assign drivers, and monitor every active bus on one map.',
    to: '/authority',
    accent: 'text-ember',
    border: 'hover:border-ember/50'
  }
];

export default function HomePage() {
  const [systemStatus, setSystemStatus] = useState({
    backend: 'checking',
    mongo: 'checking',
    message: 'Checking system status...'
  });

  useEffect(() => {
    let isMounted = true;

    async function loadStatus() {
      try {
        const response = await api.get('/api/health');
        if (!isMounted) {
          return;
        }

        setSystemStatus({
          backend: 'online',
          mongo: response.data.mongoStatus || 'unknown',
          message:
            response.data.mongoState === 1
              ? 'Backend and database are ready.'
              : 'Backend is online, MongoDB is not connected.'
        });
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setSystemStatus({
          backend: 'offline',
          mongo: 'unknown',
          message: 'Backend is not reachable.'
        });
      }
    }

    loadStatus();
    const intervalId = window.setInterval(loadStatus, 15000);

    return () => {
      isMounted = false;
      window.clearInterval(intervalId);
    };
  }, []);

  const backendOnline = systemStatus.backend === 'online';
  const mongoOnline = systemStatus.mongo === 'connected';

  return (
    <main className="min-h-screen bg-ink text-mist">
      <div className="mx-auto grid min-h-screen max-w-7xl content-center gap-8 px-4 py-8 sm:px-6 lg:px-8">
        <header className="max-w-3xl">
          <p className="text-sm uppercase tracking-[0.32em] text-tide">
            ApniBus Gateway
          </p>
          <h1 className="mt-3 font-display text-4xl text-white sm:text-6xl">
            Choose how you want to use the fleet system.
          </h1>
          <p className="mt-4 text-lg text-slate-300">
            Passengers search instantly. Drivers power the live data. Authority keeps buses,
            routes, assignments, and operations organized.
          </p>
        </header>

        <section className="grid gap-3 rounded-2xl border border-white/10 bg-slate-950/70 p-4 shadow-glow sm:grid-cols-[1fr_auto_auto] sm:items-center">
          <div>
            <p className="text-sm font-semibold text-white">System Status</p>
            <p className="mt-1 text-sm text-slate-400">{systemStatus.message}</p>
          </div>
          <span
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
              backendOnline ? 'bg-moss/15 text-emerald-100' : 'bg-rose-500/15 text-rose-100'
            }`}
          >
            Backend {backendOnline ? 'online' : systemStatus.backend}
          </span>
          <span
            className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] ${
              mongoOnline ? 'bg-moss/15 text-emerald-100' : 'bg-amber-500/15 text-amber-100'
            }`}
          >
            Mongo {systemStatus.mongo}
          </span>
        </section>

        <section className="grid gap-5 lg:grid-cols-3">
          {roles.map((role) => (
            <Link
              key={role.title}
              to={role.to}
              className={`rounded-2xl border border-white/10 bg-slate-950/70 p-6 shadow-glow transition hover:-translate-y-1 hover:bg-white/10 ${role.border}`}
            >
              <p className={`text-sm uppercase tracking-[0.28em] ${role.accent}`}>
                {role.label}
              </p>
              <h2 className="mt-4 font-display text-3xl text-white">{role.title}</h2>
              <p className="mt-4 text-sm leading-6 text-slate-300">{role.copy}</p>
              <span className="mt-8 inline-flex text-sm font-semibold text-white">
                Open {role.title}
              </span>
            </Link>
          ))}
        </section>
      </div>
    </main>
  );
}
