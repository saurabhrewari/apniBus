import { useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Popup, TileLayer } from 'react-leaflet';
import { busMarkerIcon } from './BusMarkerIcon';
import MapViewport from './MapViewport';
import { getSeatSummary, stopLabel } from '../lib/bus';

const fallbackCenter = {
  latitude: 28.6139,
  longitude: 77.209
};

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

export default function RouteDetails({ bus, onRefresh }) {
  const [showMap, setShowMap] = useState(true);
  const mapFocus = bus?.currentLocation || fallbackCenter;
  const progressPercent = useMemo(() => getProgressPercent(bus), [bus]);

  if (!bus) {
    return (
      <section className="flex min-h-[32rem] items-center justify-center rounded-2xl border border-dashed border-white/10 bg-slate-950/50 p-8 text-center text-slate-400">
        Select a bus to see live ETA, route progress, seats, and cached stops.
      </section>
    );
  }

  const eta = bus.eta || bus.lastEta;
  const isDelayed = eta?.status === 'Delayed';
  const seatSummary = getSeatSummary(bus);
  const routePositions = (bus.stops || [])
    .filter((stop) => stop.coordinates?.latitude && stop.coordinates?.longitude)
    .map((stop) => [
      Number(stop.coordinates.latitude),
      Number(stop.coordinates.longitude)
    ]);

  return (
    <section className="grid gap-5">
      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5 shadow-glow">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.28em] text-ember">
              Selected Bus
            </p>
            <h2 className="mt-2 font-display text-3xl text-white">
              {bus.busNumber}
            </h2>
            <p className="mt-2 text-sm text-slate-300">
              {bus.routeName || bus.routeNumber || bus.routeId || 'Route not set'}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <span
              className={`rounded-full px-3 py-2 text-xs font-semibold ${
                bus.seatStatus === 'Full'
                  ? 'bg-rose-500/15 text-rose-100'
                  : 'bg-moss/15 text-emerald-100'
              }`}
            >
              {seatSummary.seatsAvailable} available
            </span>
            <span
              className={`rounded-full px-3 py-2 text-xs font-semibold ${
                isDelayed ? 'bg-rose-500/15 text-rose-100' : 'bg-moss/15 text-emerald-100'
              }`}
            >
              {eta?.status || 'Awaiting ETA'}
            </span>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-4">
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Next stop
            </p>
            <p className="mt-2 font-semibold text-white">
              {eta?.nextStopName || stopLabel(bus.stops?.[bus.currentStopIndex || 0])}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              ETA
            </p>
            <p className="mt-2 font-semibold text-white">
              {eta?.etaMinutes ? `${eta.etaMinutes} min` : 'Waiting for GPS'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Delay
            </p>
            <p className={`mt-2 font-semibold ${isDelayed ? 'text-rose-200' : 'text-emerald-200'}`}>
              {eta?.delayMinutes > 0 ? `${eta.delayMinutes} min late` : 'On time'}
            </p>
          </div>
          <div className="rounded-xl border border-white/10 bg-black/25 p-4">
            <p className="text-xs uppercase tracking-[0.22em] text-slate-400">
              Seats
            </p>
            <p className="mt-2 font-semibold text-white">
              {seatSummary.occupiedSeats}/{seatSummary.totalSeats} occupied
            </p>
            <p className="mt-1 text-xs text-slate-400">
              {seatSummary.seatsAvailable} available · {bus.liveStatus || 'offline'}
            </p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-slate-950/70 p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm font-semibold text-white">Route progress</p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setShowMap((value) => !value)}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              {showMap ? 'Hide map' : 'Show map'}
            </button>
            <button
              type="button"
              onClick={onRefresh}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-slate-200 transition hover:bg-white/10"
            >
              Refresh
            </button>
          </div>
        </div>

        {showMap ? (
          <div className="mt-4 h-64 overflow-hidden rounded-xl border border-white/10">
            <MapContainer
              center={[mapFocus.latitude, mapFocus.longitude]}
              zoom={13}
              className="h-full w-full"
              scrollWheelZoom
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {routePositions.length > 1 ? (
                <Polyline
                  positions={routePositions}
                  pathOptions={{ color: '#38bdf8', weight: 5, opacity: 0.72 }}
                />
              ) : null}
              {(bus.stops || []).map((stop, index) => {
                if (!stop.coordinates?.latitude || !stop.coordinates?.longitude) {
                  return null;
                }

                const isCurrent = index === Number(bus.currentStopIndex || 0);

                return (
                  <CircleMarker
                    key={stop._id || `${stopLabel(stop)}-map`}
                    center={[
                      Number(stop.coordinates.latitude),
                      Number(stop.coordinates.longitude)
                    ]}
                    radius={isCurrent ? 8 : 5}
                    pathOptions={{
                      color: isCurrent ? '#34d399' : '#e2e8f0',
                      fillColor: isCurrent ? '#34d399' : '#0f172a',
                      fillOpacity: 0.9,
                      weight: 2
                    }}
                  >
                    <Popup>
                      <div className="text-sm">
                        <p className="font-semibold">{stopLabel(stop)}</p>
                        <p>{isCurrent ? 'Current target stop' : 'Route stop'}</p>
                      </div>
                    </Popup>
                  </CircleMarker>
                );
              })}
              {bus.currentLocation ? (
                <Marker
                  position={[
                    Number(bus.currentLocation.latitude),
                    Number(bus.currentLocation.longitude)
                  ]}
                  icon={busMarkerIcon}
                >
                  <Popup>
                    <div className="space-y-1 text-sm">
                      <p className="font-semibold">{bus.busNumber}</p>
                      <p>{eta?.nextStopName || 'Next stop pending'}</p>
                    </div>
                  </Popup>
                </Marker>
              ) : null}
              <MapViewport focus={mapFocus} />
            </MapContainer>
          </div>
        ) : null}

        <div className="relative mt-6 pl-12">
          <div className="absolute left-[1.55rem] top-2 h-[calc(100%-1rem)] w-1 rounded-full bg-white/10" />
          <div
            className="absolute left-[1.55rem] top-2 w-1 rounded-full bg-moss transition-all"
            style={{ height: `calc(${progressPercent}% - 0.5rem)` }}
          />
          {bus.stops?.map((stop, index) => {
            const isNextStop = eta?.nextStopName === stopLabel(stop);
            const passed = isStopPassed(index, bus);
            const schedule = bus.schedules?.find((item) => Number(item.stopSequence) === index);
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
                    <span>Scheduled: {schedule?.arrivalTime || 'Not set'}</span>
                    <span>Estimated: {estimatedText}</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
