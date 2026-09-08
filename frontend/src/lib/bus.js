export const RECENT_BUSES_KEY = 'apnibus.recentBuses';
export const CACHED_ROUTE_KEY = 'apnibus.cachedRoute';

export function readJson(key, fallback) {
  try {
    const value = window.localStorage.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

export function hasEta(value) {
  return value && Number.isFinite(Number(value.etaMinutes));
}

export function isBusOnline(bus) {
  return bus?.liveStatus === 'online';
}

export function getSeatStatus(bus) {
  if (bus?.seatStatus) {
    return bus.seatStatus;
  }

  return Number(bus?.seatsAvailable) > 0 ? 'Available' : 'Full';
}

export function getSeatSummary(bus) {
  const totalSeats = Number(bus?.totalSeats) || 0;
  const occupiedSeats = Math.min(Math.max(Number(bus?.occupiedSeats) || 0, 0), totalSeats);
  const seatsAvailable = Math.max(
    Number.isFinite(Number(bus?.seatsAvailable)) ? Number(bus.seatsAvailable) : totalSeats - occupiedSeats,
    0
  );

  return {
    totalSeats,
    occupiedSeats,
    seatsAvailable,
    seatStatus: seatsAvailable > 0 ? 'Available' : 'Full'
  };
}

export function stopLabel(stop) {
  return stop?.stopName || stop?.name || 'Stop';
}

export function normalizeBus(bus) {
  if (!bus) {
    return null;
  }

  const routeStops = bus.route?.stops?.length ? bus.route.stops : bus.stops;
  const stops = Array.isArray(routeStops)
    ? routeStops.map((stop) => ({
        ...stop,
        stopName: stopLabel(stop),
        name: stopLabel(stop)
      }))
    : [];

  return {
    ...bus,
    routeName:
      bus.routeName ||
      bus.route?.routeName ||
      (stops.length > 1
        ? `${stops[0].stopName} to ${stops[stops.length - 1].stopName}`
        : bus.routeId),
    routeNumber: bus.routeNumber || bus.route?.routeNumber || bus.routeId,
    origin: bus.origin || bus.route?.origin || stops[0]?.stopName || '',
    destination:
      bus.destination || bus.route?.destination || stops[stops.length - 1]?.stopName || '',
    stops,
    seatStatus: getSeatStatus(bus),
    eta: isBusOnline(bus) && hasEta(bus.eta) ? bus.eta : null,
    staleEta: !isBusOnline(bus) && hasEta(bus.staleEta || bus.lastEta)
      ? bus.staleEta || bus.lastEta
      : null
  };
}

export function mergeLiveBus(existingBus, payload) {
  return normalizeBus({
    ...existingBus,
    _id: payload.busId ?? existingBus?._id,
    busNumber: payload.busNumber ?? existingBus?.busNumber,
    routeId: payload.routeId ?? existingBus?.routeId,
    routeNumber: payload.routeNumber ?? existingBus?.routeNumber,
    routeName: payload.routeName ?? existingBus?.routeName,
    origin: payload.origin ?? existingBus?.origin,
    destination: payload.destination ?? existingBus?.destination,
    stops: payload.stops?.length ? payload.stops : existingBus?.stops,
    currentStopIndex: payload.currentStopIndex ?? existingBus?.currentStopIndex,
    currentLocation: payload.currentLocation ?? existingBus?.currentLocation,
    seatsAvailable: payload.seatsAvailable ?? existingBus?.seatsAvailable,
    occupiedSeats: payload.occupiedSeats ?? existingBus?.occupiedSeats,
    totalSeats: payload.totalSeats ?? existingBus?.totalSeats,
    seatStatus: payload.seatStatus ?? existingBus?.seatStatus,
    liveStatus: payload.liveStatus ?? existingBus?.liveStatus,
    lastActiveAt: payload.lastActiveAt ?? existingBus?.lastActiveAt,
    isActive: payload.isActive ?? existingBus?.isActive,
    eta: payload.liveStatus === 'online' ? payload.eta ?? existingBus?.eta : null,
    staleEta: payload.liveStatus === 'online' ? null : payload.staleEta ?? existingBus?.staleEta,
    landmark: payload.landmark ?? existingBus?.landmark,
    updatedAt: payload.updatedAt ?? existingBus?.updatedAt
  });
}

export function saveRecentBus(busNumber) {
  if (!busNumber) {
    return [];
  }

  const current = readJson(RECENT_BUSES_KEY, []);
  const nextRecent = [busNumber, ...current.filter((item) => item !== busNumber)].slice(0, 3);
  window.localStorage.setItem(RECENT_BUSES_KEY, JSON.stringify(nextRecent));
  return nextRecent;
}

export function cacheRoute(bus) {
  const normalized = normalizeBus(bus);
  if (normalized?.stops?.length) {
    window.localStorage.setItem(CACHED_ROUTE_KEY, JSON.stringify(normalized));
  }
}
