const express = require('express');
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const Schedule = require('../models/Schedule');
const Trip = require('../models/Trip');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');

const router = express.Router();
const ONLINE_WINDOW_MS = 1000 * 60 * 3;

router.get('/overview', requireAuth(['authority']), async (_req, res) => {
    try {
        const now = Date.now();
        const [buses, routes, scheduleCount, runningTrips, completedTripsToday, offlineTripsToday] = await Promise.all([
            Bus.find().populate('route', 'routeNumber routeName origin destination'),
            Route.find(),
            Schedule.countDocuments(),
            Trip.countDocuments({ status: 'running' }),
            Trip.countDocuments({
                status: 'completed',
                endedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            }),
            Trip.countDocuments({
                status: 'offline',
                endedAt: { $gte: new Date(new Date().setHours(0, 0, 0, 0)) }
            })
        ]);

        const activeBuses = buses.filter((bus) => bus.isActive);
        const onlineBuses = activeBuses.filter((bus) => {
            const lastActiveAt = bus.lastActiveAt ? new Date(bus.lastActiveAt).getTime() : 0;
            return bus.liveStatus === 'online' && now - lastActiveAt <= ONLINE_WINDOW_MS;
        });
        const delayedBuses = activeBuses.filter((bus) => Number(bus.lastEta?.delayMinutes) > 0);
        const totalSeats = activeBuses.reduce((sum, bus) => sum + (Number(bus.totalSeats) || 0), 0);
        const occupiedSeats = activeBuses.reduce((sum, bus) => sum + (Number(bus.occupiedSeats) || 0), 0);

        const routeUsage = routes.map((route) => {
            const assignedBuses = buses.filter((bus) => String(bus.route?._id || bus.route) === String(route._id));
            const delayed = assignedBuses.filter((bus) => Number(bus.lastEta?.delayMinutes) > 0);

            return {
                routeId: route._id,
                routeNumber: route.routeNumber,
                routeName: route.routeName,
                origin: route.origin,
                destination: route.destination,
                assignedBuses: assignedBuses.length,
                delayedBuses: delayed.length,
                averageDelayMinutes:
                    delayed.length > 0
                        ? Math.round(delayed.reduce((sum, bus) => sum + Number(bus.lastEta.delayMinutes), 0) / delayed.length)
                        : 0
            };
        });

        return res.json({
            activeBuses: activeBuses.length,
            onlineBuses: onlineBuses.length,
            offlineBuses: Math.max(activeBuses.length - onlineBuses.length, 0),
            inactiveBuses: buses.length - activeBuses.length,
            totalRoutes: routes.length,
            activeRoutes: routes.filter((route) => route.isActive).length,
            scheduleCount,
            runningTrips,
            completedTripsToday,
            offlineTripsToday,
            delayedBuses: delayedBuses.length,
            totalSeats,
            occupiedSeats,
            availableSeats: Math.max(totalSeats - occupiedSeats, 0),
            occupancyRate: totalSeats > 0 ? Math.round((occupiedSeats / totalSeats) * 100) : 0,
            mostActiveRoutes: routeUsage
                .sort((first, second) => second.assignedBuses - first.assignedBuses)
                .slice(0, 5),
            routePerformance: routeUsage
        });
    } catch (err) {
        console.error('Analytics error:', err.message);
        return sendError(res, 'Server Error');
    }
});

router.get('/data-quality', requireAuth(['authority']), async (_req, res) => {
    try {
        const [buses, routes, schedules] = await Promise.all([
            Bus.find().populate('route', 'routeNumber routeName origin destination'),
            Route.find().populate('stops', 'stopName name coordinates isActive'),
            Schedule.find().select('busId routeId stopId')
        ]);

        const scheduledBusIds = new Set(schedules.map((schedule) => String(schedule.busId)));
        const scheduledRouteIds = new Set(schedules.map((schedule) => String(schedule.routeId)));

        const stopsByRoute = routes.flatMap((route) =>
            (route.stops || []).map((stop) => ({
                routeNumber: route.routeNumber,
                stop
            }))
        );

        const missingStopCoordinates = stopsByRoute
            .filter(({ stop }) => !stop?.coordinates?.latitude || !stop?.coordinates?.longitude)
            .map(({ routeNumber, stop }) => ({
                routeNumber,
                stopId: stop?._id,
                stopName: stop?.stopName || stop?.name || 'Unknown stop'
            }));

        const routesWithoutStops = routes
            .filter((route) => !route.stops || route.stops.length === 0)
            .map((route) => ({
                routeId: route._id,
                routeNumber: route.routeNumber,
                routeName: route.routeName
            }));

        const routesWithoutSchedules = routes
            .filter((route) => !scheduledRouteIds.has(String(route._id)))
            .map((route) => ({
                routeId: route._id,
                routeNumber: route.routeNumber,
                routeName: route.routeName
            }));

        const busesWithoutRoutes = buses
            .filter((bus) => !bus.route && !bus.routeId)
            .map((bus) => ({
                busId: bus._id,
                busNumber: bus.busNumber
            }));

        const busesWithoutSchedules = buses
            .filter((bus) => !scheduledBusIds.has(String(bus._id)))
            .map((bus) => ({
                busId: bus._id,
                busNumber: bus.busNumber,
                routeNumber: bus.route?.routeNumber || bus.routeId || ''
            }));

        const inactiveBuses = buses
            .filter((bus) => !bus.isActive)
            .map((bus) => ({
                busId: bus._id,
                busNumber: bus.busNumber
            }));

        const duplicateRouteStops = routes.flatMap((route) => {
            const seen = new Set();
            const duplicates = [];

            for (const stop of route.stops || []) {
                const key = String(stop?._id);
                if (seen.has(key)) {
                    duplicates.push({
                        routeId: route._id,
                        routeNumber: route.routeNumber,
                        stopId: stop?._id,
                        stopName: stop?.stopName || stop?.name || 'Unknown stop'
                    });
                }
                seen.add(key);
            }

            return duplicates;
        });

        const issues = {
            missingStopCoordinates,
            routesWithoutStops,
            routesWithoutSchedules,
            busesWithoutRoutes,
            busesWithoutSchedules,
            inactiveBuses,
            duplicateRouteStops
        };

        const totalIssues = Object.values(issues).reduce((sum, items) => sum + items.length, 0);

        return res.json({
            totalIssues,
            status: totalIssues === 0 ? 'healthy' : 'needs-attention',
            issues
        });
    } catch (err) {
        console.error('Data quality error:', err.message);
        return sendError(res, 'Server Error');
    }
});

module.exports = router;
