const express = require('express');
const router = express.Router();
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const Schedule = require('../models/Schedule');
const Stop = require('../models/Stop');
const { calculateEtaForBus, haversineDistanceKm, serializeStop } = require('../utils/tracking');

function escapeRegex(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function stopName(stop) {
    return stop?.stopName || stop?.name || '';
}

function seatStatus(bus) {
    const available = Number(bus.seatsAvailable) || 0;
    return available > 0 ? 'Available' : 'Full';
}

function getLiveStatus(bus) {
    const lastActiveAt = bus.lastActiveAt ? new Date(bus.lastActiveAt).getTime() : 0;
    const isRecentlyActive = lastActiveAt && Date.now() - lastActiveAt <= 1000 * 60 * 3;

    if (!bus.isActive) {
        return 'inactive';
    }

    return bus.liveStatus === 'online' && isRecentlyActive ? 'online' : 'offline';
}

function hasEta(value) {
    return value && Number.isFinite(Number(value.etaMinutes));
}

function formatBusResult(bus, schedules = []) {
    const populatedRoute = bus.route && typeof bus.route === 'object' ? bus.route : null;
    const routeStops = populatedRoute?.stops?.length ? populatedRoute.stops : bus.stops;
    const stops = Array.isArray(routeStops) ? routeStops.map(serializeStop) : [];
    const routeNumber = populatedRoute?.routeNumber || bus.routeId || 'Route';
    const routeName =
        populatedRoute?.routeName ||
        (stops.length > 1
            ? `${stopName(stops[0])} to ${stopName(stops[stops.length - 1])}`
            : routeNumber);
    const liveStatus = getLiveStatus(bus);
    const eta = liveStatus === 'online'
        ? calculateEtaForBus(
            { ...bus.toObject(), stops: routeStops },
            schedules,
            bus.currentLocation
        )
        : null;

    return {
        _id: bus._id,
        busNumber: bus.busNumber,
        routeId: bus.routeId || populatedRoute?._id,
        routeNumber,
        routeName,
        origin: populatedRoute?.origin || stops[0]?.stopName || '',
        destination: populatedRoute?.destination || stops[stops.length - 1]?.stopName || '',
        stops,
        currentLocation: bus.currentLocation,
        currentStopIndex: bus.currentStopIndex || 0,
        seatsAvailable: bus.seatsAvailable || 0,
        occupiedSeats: bus.occupiedSeats || 0,
        totalSeats: bus.totalSeats || 30,
        seatStatus: seatStatus(bus),
        liveStatus,
        lastActiveAt: bus.lastActiveAt,
        isActive: bus.isActive,
        isJourneyActive: liveStatus === 'online' && Boolean(bus.isJourneyActive),
        eta: hasEta(eta) ? eta : null,
        staleEta: liveStatus === 'online' ? null : hasEta(bus.lastEta) ? bus.lastEta : null,
        schedules: schedules.map((schedule) => ({
            stopId: schedule.stopId,
            stopSequence: schedule.stopSequence,
            arrivalTime: schedule.arrivalTime,
            departureTime: schedule.departureTime
        })),
        updatedAt: bus.updatedAt
    };
}

async function loadSchedulesForBuses(buses) {
    const busIds = buses.map((bus) => bus._id);
    const schedules = await Schedule.find({ busId: { $in: busIds } })
        .sort({ busId: 1, stopSequence: 1 })
        .lean();

    return schedules.reduce((grouped, schedule) => {
        const key = String(schedule.busId);
        if (!grouped[key]) {
            grouped[key] = [];
        }

        grouped[key].push(schedule);
        return grouped;
    }, {});
}

router.get('/nearby-stops', async (req, res) => {
    try {
        const latitude = Number(req.query.latitude);
        const longitude = Number(req.query.longitude);
        const limit = Math.min(Number(req.query.limit) || 5, 12);

        if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
            return res.status(400).json({ msg: 'latitude and longitude are required' });
        }

        const stops = await Stop.find({
            'coordinates.latitude': { $exists: true },
            'coordinates.longitude': { $exists: true }
        }).select('_id stopName name coordinates');

        const results = stops
            .map((stop) => ({
                ...serializeStop(stop),
                distanceKm: haversineDistanceKm(
                    { latitude, longitude },
                    {
                        latitude: stop.coordinates?.latitude,
                        longitude: stop.coordinates?.longitude
                    }
                )
            }))
            .filter((stop) => Number.isFinite(stop.distanceKm))
            .sort((first, second) => first.distanceKm - second.distanceKm)
            .slice(0, limit)
            .map((stop) => ({
                ...stop,
                distanceKm: Number(stop.distanceKm.toFixed(2))
            }));

        res.json({ results });
    } catch (err) {
        console.error('Nearby stops error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

router.get('/', async (req, res) => {
    try {
        const query = String(req.query.query || '').trim();
        const from = String(req.query.from || '').trim();
        const to = String(req.query.to || '').trim();
        const regex = query ? new RegExp(escapeRegex(query), 'i') : null;
        const stopRegexes = [query, from, to]
            .filter(Boolean)
            .map((value) => new RegExp(escapeRegex(value), 'i'));

        const matchingStops = stopRegexes.length
            ? await Stop.find({
                $or: stopRegexes.flatMap((item) => [
                    { stopName: item },
                    { name: item }
                ])
            }).select('_id stopName name coordinates')
            : [];
        const matchingStopIds = matchingStops.map((stop) => stop._id);

        const routeConditions = [];
        if (regex) {
            routeConditions.push(
                { routeNumber: regex },
                { routeName: regex },
                { origin: regex },
                { destination: regex }
            );
        }

        if (matchingStopIds.length > 0) {
            routeConditions.push({ stops: { $in: matchingStopIds } });
        }

        const matchingRoutes = routeConditions.length
            ? await Route.find({ $or: routeConditions }).select('_id')
            : [];
        const matchingRouteIds = matchingRoutes.map((route) => route._id);

        const busConditions = [];
        if (regex) {
            busConditions.push({ busNumber: regex }, { routeId: regex });
        }

        if (matchingRouteIds.length > 0) {
            busConditions.push({ route: { $in: matchingRouteIds } });
        }

        if (matchingStopIds.length > 0) {
            busConditions.push({ stops: { $in: matchingStopIds } });
        }

        let buses = await Bus.find(busConditions.length ? { $or: busConditions } : {})
            .populate('stops')
            .populate({
                path: 'route',
                populate: { path: 'stops' }
            })
            .sort({ isJourneyActive: -1, updatedAt: -1 })
            .limit(25);

        if (from && to) {
            const fromRegex = new RegExp(escapeRegex(from), 'i');
            const toRegex = new RegExp(escapeRegex(to), 'i');

            buses = buses.filter((bus) => {
                const routeStops = bus.route?.stops?.length ? bus.route.stops : bus.stops;
                const names = routeStops.map(stopName);
                const fromIndex = names.findIndex((name) => fromRegex.test(name));
                const toIndex = names.findIndex((name) => toRegex.test(name));

                return fromIndex !== -1 && toIndex !== -1 && fromIndex < toIndex;
            });
        }

        const groupedSchedules = await loadSchedulesForBuses(buses);

        res.json({
            query,
            from,
            to,
            results: buses.map((bus) => formatBusResult(bus, groupedSchedules[String(bus._id)] || []))
        });
    } catch (err) {
        console.error('Search error:', err.message);
        res.status(500).json({ msg: 'Server Error' });
    }
});

module.exports = router;
