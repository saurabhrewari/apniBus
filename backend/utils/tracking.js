const DEFAULT_AVERAGE_SPEED_KMPH = 28;
const EARTH_RADIUS_KM = 6371;
const STOP_REACHED_THRESHOLD_KM = 0.15;

function toRadians(value) {
    return (Number(value) * Math.PI) / 180;
}

function haversineDistanceKm(from, to) {
    if (!from || !to) {
        return null;
    }

    const lat1 = Number(from.latitude);
    const lon1 = Number(from.longitude);
    const lat2 = Number(to.latitude);
    const lon2 = Number(to.longitude);

    if (![lat1, lon1, lat2, lon2].every(Number.isFinite)) {
        return null;
    }

    const deltaLat = toRadians(lat2 - lat1);
    const deltaLon = toRadians(lon2 - lon1);
    const phi1 = toRadians(lat1);
    const phi2 = toRadians(lat2);

    const a =
        Math.sin(deltaLat / 2) ** 2 +
        Math.cos(phi1) * Math.cos(phi2) * Math.sin(deltaLon / 2) ** 2;

    return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function getStopName(stop) {
    return stop?.stopName || stop?.name || 'Stop';
}

function getStopCoordinates(stop) {
    if (!stop?.coordinates) {
        return null;
    }

    return {
        latitude: Number(stop.coordinates.latitude),
        longitude: Number(stop.coordinates.longitude)
    };
}

function minutesUntilClockTime(clockTime, now = new Date()) {
    if (!clockTime || typeof clockTime !== 'string') {
        return null;
    }

    const [hoursText, minutesText] = clockTime.split(':');
    const hours = Number(hoursText);
    const minutes = Number(minutesText);

    if (!Number.isInteger(hours) || !Number.isInteger(minutes)) {
        return null;
    }

    const scheduled = new Date(now);
    scheduled.setHours(hours, minutes, 0, 0);

    if (scheduled < now) {
        scheduled.setDate(scheduled.getDate() + 1);
    }

    return Math.round((scheduled.getTime() - now.getTime()) / 60000);
}

function calculateDelayMinutes(etaMinutes, schedule, now = new Date()) {
    const scheduledMinutes = minutesUntilClockTime(schedule?.arrivalTime, now);

    if (scheduledMinutes === null || etaMinutes === null) {
        return 0;
    }

    return Math.max(0, Math.round(etaMinutes - scheduledMinutes));
}

function calculateEtaForBus(bus, schedules = [], currentLocation = null, now = new Date()) {
    const stops = Array.isArray(bus?.stops) ? bus.stops : [];
    const location = currentLocation || bus?.currentLocation;

    if (!location || stops.length === 0) {
        return null;
    }

    let nextStopIndex = Math.min(Number(bus.currentStopIndex) || 0, stops.length - 1);
    const currentStop = stops[nextStopIndex];
    const currentStopDistance = haversineDistanceKm(location, getStopCoordinates(currentStop));

    if (
        currentStopDistance !== null &&
        currentStopDistance <= STOP_REACHED_THRESHOLD_KM &&
        nextStopIndex < stops.length - 1
    ) {
        nextStopIndex += 1;
    }

    const nextStop = stops[nextStopIndex];
    const nextCoordinates = getStopCoordinates(nextStop);
    const distanceKm = haversineDistanceKm(location, nextCoordinates);

    if (distanceKm === null) {
        return null;
    }

    const speedKmph = Number(bus.averageSpeedKmph) || DEFAULT_AVERAGE_SPEED_KMPH;
    const etaMinutes = Math.max(1, Math.round((distanceKm / speedKmph) * 60));
    const schedule = schedules.find((item) => Number(item.stopSequence) === nextStopIndex);
    const delayMinutes = calculateDelayMinutes(etaMinutes, schedule, now);

    return {
        nextStopIndex,
        nextStopId: nextStop?._id,
        nextStopName: getStopName(nextStop),
        distanceKm: Number(distanceKm.toFixed(2)),
        etaMinutes,
        status: delayMinutes > 0 ? 'Delayed' : 'On Time',
        delayMinutes,
        scheduledArrivalTime: schedule?.arrivalTime || null,
        calculatedAt: now
    };
}

function serializeStop(stop) {
    return {
        _id: stop?._id,
        stopName: getStopName(stop),
        name: getStopName(stop),
        coordinates: stop?.coordinates || null
    };
}

module.exports = {
    calculateEtaForBus,
    haversineDistanceKm,
    serializeStop
};
