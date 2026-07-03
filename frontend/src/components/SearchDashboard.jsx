import { useState } from 'react';

export default function SearchDashboard({
  onSearch,
  onSelectBus,
  results,
  recentBuses,
  status,
  error,
  connectionState,
  isLoading
}) {
  const [fromStop, setFromStop] = useState('');
  const [toStop, setToStop] = useState('');
  const [busNumber, setBusNumber] = useState('');

  function searchByStops(event) {
    event.preventDefault();
    onSearch({ from: fromStop, to: toStop, query: '' });
  }

  function searchByBus(event) {
    event.preventDefault();
    onSearch({ query: busNumber, from: '', to: '' });
  }

  return (
    <section className="grid gap-5">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-glow">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-tide">
              Passenger Search
            </p>
            <h1 className="mt-2 font-display text-3xl text-white sm:text-4xl">
              Where is my bus?
            </h1>
          </div>
          <span className="w-fit rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-200">
            Socket {connectionState}
          </span>
        </div>

        <p className="mt-3 text-sm text-slate-300">{status}</p>
        {error ? (
          <p className="mt-3 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-100">
            {error}
          </p>
        ) : null}
      </div>

      <form
        onSubmit={searchByStops}
        className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"
      >
        <p className="text-sm font-semibold text-white">Find buses by stops</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <label className="grid gap-2 text-sm text-slate-300">
            <span>From Stop</span>
            <input
              value={fromStop}
              onChange={(event) => setFromStop(event.target.value)}
              placeholder="Rewari"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-tide/60"
            />
          </label>
          <label className="grid gap-2 text-sm text-slate-300">
            <span>To Stop</span>
            <input
              value={toStop}
              onChange={(event) => setToStop(event.target.value)}
              placeholder="Gurugram"
              className="rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-tide/60"
            />
          </label>
        </div>
        <button
          type="submit"
          disabled={isLoading || (!fromStop && !toStop)}
          className="mt-4 w-full rounded-xl bg-moss px-4 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          Search route
        </button>
      </form>

      <form
        onSubmit={searchByBus}
        className="rounded-2xl border border-white/10 bg-slate-950/70 p-5"
      >
        <p className="text-sm font-semibold text-white">Search by bus number</p>
        <div className="mt-4 flex gap-3">
          <input
            value={busNumber}
            onChange={(event) => setBusNumber(event.target.value)}
            placeholder="12A"
            className="min-w-0 flex-1 rounded-xl border border-white/10 bg-black/30 px-4 py-3 text-white outline-none transition placeholder:text-slate-500 focus:border-tide/60"
          />
          <button
            type="submit"
            disabled={isLoading || !busNumber}
            className="rounded-xl bg-tide px-5 py-3 font-semibold text-slate-950 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Search
          </button>
        </div>
      </form>

      {recentBuses.length > 0 ? (
        <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
          <p className="text-sm font-semibold text-white">Recent buses</p>
          <div className="mt-3 flex flex-wrap gap-2">
            {recentBuses.map((item) => (
              <button
                type="button"
                key={item}
                onClick={() => onSearch({ query: item, from: '', to: '' })}
                className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
              >
                {item}
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Search results</p>
          <span className="text-xs uppercase tracking-[0.22em] text-slate-400">
            {results.length} found
          </span>
        </div>

        <div className="mt-4 grid max-h-[34rem] gap-3 overflow-y-auto pr-1">
          {results.length > 0 ? (
            results.map((bus) => (
              <button
                type="button"
                key={bus._id || bus.busNumber}
                onClick={() => onSelectBus(bus)}
                className="rounded-xl border border-white/10 bg-black/25 px-4 py-4 text-left transition hover:border-tide/50 hover:bg-white/10"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-white">
                      {bus.busNumber}
                    </p>
                    <p className="mt-1 truncate text-sm text-slate-300">
                      {bus.routeName || bus.routeNumber || bus.routeId || 'Route not set'}
                    </p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full px-3 py-1 text-[11px] font-semibold ${
                      bus.seatStatus === 'Full'
                        ? 'bg-rose-500/15 text-rose-200'
                        : 'bg-moss/15 text-emerald-200'
                    }`}
                  >
                    {bus.seatStatus || 'Available'}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 text-xs text-slate-400">
                  <span>{bus.origin || 'Origin'}</span>
                  <span>to</span>
                  <span>{bus.destination || 'Destination'}</span>
                </div>
                {bus.eta ? (
                  <p
                    className={`mt-3 text-sm ${
                      bus.eta.status === 'Delayed' ? 'text-rose-200' : 'text-emerald-200'
                    }`}
                  >
                    {bus.eta.nextStopName}: {bus.eta.etaMinutes} min
                    {bus.eta.delayMinutes > 0
                      ? `, delayed by ${bus.eta.delayMinutes} min`
                      : ''}
                  </p>
                ) : null}
              </button>
            ))
          ) : (
            <div className="rounded-xl border border-dashed border-white/10 bg-black/20 px-4 py-8 text-sm text-slate-400">
              Search for a stop or bus number to see matching routes.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
