const express = require('express');
const router = express.Router();
const Stop = require('../models/Stop');
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const Schedule = require('../models/Schedule');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { recordAudit } = require('../utils/audit');
const { validateCoordinates } = require('../middleware/validate');

function stopQuery(name) {
    return {
        $or: [
            { stopName: name },
            { name }
        ]
    };
}

function parseCoordinates(body) {
    const latitude = Number(body.latitude ?? body.coordinates?.latitude);
    const longitude = Number(body.longitude ?? body.coordinates?.longitude);

    if (!validateCoordinates(latitude, longitude)) {
        return null;
    }

    return { latitude, longitude };
}

// POST /api/data/stops (Same as before)
router.post('/stops', requireAuth(['authority']), async (req, res) => {
    try {
        const name = String(req.body.stopName || req.body.name || '').trim();
        if (!name) {
            return sendError(res, 'stopName is required', 400);
        }

        let stop = await Stop.findOne(stopQuery(name));
        if (stop) {
            return sendError(res, 'Stop already exists', 400);
        }

        stop = new Stop({
            stopName: name,
            name,
            coordinates: parseCoordinates(req.body)
        });
        await stop.save();
        await recordAudit({
            req,
            action: 'stop.create',
            entityType: 'Stop',
            entityId: stop._id,
            entityLabel: stop.stopName,
            metadata: { coordinates: stop.coordinates }
        });
        res.status(201).json({ msg: 'Stop added successfully', stop });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

// GET /api/data/stops (Same as before)
router.get('/stops', async (req, res) => {
    try {
        const stops = await Stop.find().sort({ stopName: 1, name: 1 });
        res.json(stops);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.patch('/stops/:id', requireAuth(['authority']), async (req, res) => {
    try {
        const updates = {};
        const name = String(req.body.stopName || req.body.name || '').trim();

        if (name) {
            updates.stopName = name;
            updates.name = name;
        }

        const coordinates = parseCoordinates(req.body);
        if (coordinates) {
            updates.coordinates = coordinates;
        }

        if (typeof req.body.isActive === 'boolean') {
            updates.isActive = req.body.isActive;
        }

        const stop = await Stop.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        );

        if (!stop) {
            return sendError(res, 'Stop not found', 404);
        }

        await recordAudit({
            req,
            action: 'stop.update',
            entityType: 'Stop',
            entityId: stop._id,
            entityLabel: stop.stopName,
            metadata: { updatedFields: Object.keys(updates) }
        });

        return res.json({ msg: 'Stop updated successfully', stop });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

router.delete('/stops/:id', requireAuth(['authority']), async (req, res) => {
    try {
        const isUsed = await Route.exists({ stops: req.params.id });
        if (isUsed) {
            return sendError(res, 'Stop is used by a route. Deactivate it instead of deleting.', 400);
        }

        const stop = await Stop.findByIdAndDelete(req.params.id);
        if (!stop) {
            return sendError(res, 'Stop not found', 404);
        }

        await recordAudit({
            req,
            action: 'stop.delete',
            entityType: 'Stop',
            entityId: stop._id,
            entityLabel: stop.stopName
        });

        return res.json({ msg: 'Stop deleted successfully' });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

router.post('/routes', requireAuth(['authority']), async (req, res) => {
    try {
        const { routeNumber, origin, destination, routeName } = req.body;
        const stopNames = Array.isArray(req.body.stops) ? req.body.stops : [];
        const segmentDistancesKm = Array.isArray(req.body.segmentDistancesKm)
            ? req.body.segmentDistancesKm.map(Number).filter(Number.isFinite)
            : [];

        if (!routeNumber || !origin || !destination || stopNames.length === 0) {
            return sendError(res, 'routeNumber, origin, destination, and stops are required', 400);
        }

        if (stopNames.length < 2) {
            return sendError(res, 'A route must include at least 2 stops', 400);
        }

        if (segmentDistancesKm.length > 0 && segmentDistancesKm.length !== stopNames.length - 1) {
            return sendError(res, 'segmentDistancesKm must contain one distance per route segment', 400);
        }

        const stopIds = [];
        for (const item of stopNames) {
            const name = typeof item === 'string' ? item : item.stopName || item.name;
            const stop = await Stop.findOne(stopQuery(name));
            if (!stop) {
                return sendError(res, `Stop not found: ${name}`, 404);
            }
            stopIds.push(stop._id);
        }

        const route = await Route.findOneAndUpdate(
            { routeNumber },
            {
                $set: {
                    routeNumber,
                    routeName: routeName || `${origin} to ${destination}`,
                    origin,
                    destination,
                    stops: stopIds,
                    segmentDistancesKm
                }
            },
            { new: true, upsert: true, runValidators: true }
        ).populate('stops');

        await recordAudit({
            req,
            action: 'route.upsert',
            entityType: 'Route',
            entityId: route._id,
            entityLabel: route.routeNumber,
            metadata: {
                origin,
                destination,
                stopCount: route.stops.length,
                segmentCount: segmentDistancesKm.length
            }
        });

        res.status(201).json({ msg: 'Route saved successfully', route });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

router.get('/routes', async (req, res) => {
    try {
        const routes = await Route.find().populate('stops').sort({ routeNumber: 1 });
        res.json(routes);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

router.patch('/routes/:id', requireAuth(['authority']), async (req, res) => {
    try {
        const updates = {};
        const { routeNumber, routeName, origin, destination } = req.body;
        const stopNames = Array.isArray(req.body.stops) ? req.body.stops : null;

        if (routeNumber) updates.routeNumber = routeNumber;
        if (routeName) updates.routeName = routeName;
        if (origin) updates.origin = origin;
        if (destination) updates.destination = destination;
        if (Array.isArray(req.body.segmentDistancesKm)) {
            updates.segmentDistancesKm = req.body.segmentDistancesKm.map(Number).filter(Number.isFinite);
        }
        if (typeof req.body.isActive === 'boolean') {
            updates.isActive = req.body.isActive;
        }

        if (stopNames) {
            const stopIds = [];
            for (const item of stopNames) {
                const name = typeof item === 'string' ? item : item.stopName || item.name;
                const stop = await Stop.findOne(stopQuery(name));
                if (!stop) {
                    return sendError(res, `Stop not found: ${name}`, 404);
                }
                stopIds.push(stop._id);
            }
            if (stopIds.length < 2) {
                return sendError(res, 'A route must include at least 2 stops', 400);
            }
            updates.stops = stopIds;
        }

        if (
            updates.segmentDistancesKm &&
            ((updates.stops && updates.segmentDistancesKm.length !== updates.stops.length - 1) ||
                (!updates.stops && updates.segmentDistancesKm.length !== Math.max((await Route.findById(req.params.id).select('stops'))?.stops?.length - 1, 0)))
        ) {
            return sendError(res, 'segmentDistancesKm must contain one distance per route segment', 400);
        }

        const route = await Route.findByIdAndUpdate(
            req.params.id,
            { $set: updates },
            { new: true, runValidators: true }
        ).populate('stops');

        if (!route) {
            return sendError(res, 'Route not found', 404);
        }

        if (updates.stops) {
            await Bus.updateMany(
                { route: route._id },
                { $set: { stops: updates.stops, routeId: route.routeNumber } }
            );
        }

        await recordAudit({
            req,
            action: 'route.update',
            entityType: 'Route',
            entityId: route._id,
            entityLabel: route.routeNumber,
            metadata: { updatedFields: Object.keys(updates) }
        });

        return res.json({ msg: 'Route updated successfully', route });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

router.delete('/routes/:id', requireAuth(['authority']), async (req, res) => {
    try {
        const assignedBus = await Bus.exists({ route: req.params.id });
        if (assignedBus) {
            return sendError(res, 'Route is assigned to a bus. Deactivate it instead of deleting.', 400);
        }

        const route = await Route.findByIdAndDelete(req.params.id);
        if (!route) {
            return sendError(res, 'Route not found', 404);
        }

        await Schedule.deleteMany({ routeId: route._id });
        await recordAudit({
            req,
            action: 'route.delete',
            entityType: 'Route',
            entityId: route._id,
            entityLabel: route.routeNumber
        });
        return res.json({ msg: 'Route deleted successfully' });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

router.post('/schedules', requireAuth(['authority']), async (req, res) => {
    try {
        const { busNumber, routeNumber } = req.body;
        const items = Array.isArray(req.body.schedules) ? req.body.schedules : [];

        if (!busNumber || !routeNumber || items.length === 0) {
            return sendError(res, 'busNumber, routeNumber, and schedules are required', 400);
        }

        const bus = await Bus.findOne({ busNumber });
        const route = await Route.findOne({ routeNumber });

        if (!bus || !route) {
            return sendError(res, 'Bus or route not found', 404);
        }

        await Schedule.deleteMany({ busId: bus._id, routeId: route._id });

        const schedules = [];
        for (let index = 0; index < items.length; index += 1) {
            const item = items[index];
            const stopName = item.stopName || item.name;
            const stop = await Stop.findOne(stopQuery(stopName));

            if (!stop) {
                return sendError(res, `Stop not found: ${stopName}`, 404);
            }

            schedules.push({
                busId: bus._id,
                routeId: route._id,
                stopId: stop._id,
                stopSequence: Number.isInteger(item.stopSequence) ? item.stopSequence : index,
                arrivalTime: item.arrivalTime,
                departureTime: item.departureTime || item.arrivalTime
            });
        }

        const created = await Schedule.insertMany(schedules, { ordered: true });
        await recordAudit({
            req,
            action: 'schedule.replace',
            entityType: 'Schedule',
            entityId: `${bus._id}:${route._id}`,
            entityLabel: `${bus.busNumber} ${route.routeNumber}`,
            metadata: {
                busNumber: bus.busNumber,
                routeNumber: route.routeNumber,
                rowCount: created.length
            }
        });
        res.status(201).json({ msg: 'Schedules saved successfully', schedules: created });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

router.get('/schedules', async (req, res) => {
    try {
        const filter = {};
        if (req.query.busId) filter.busId = req.query.busId;
        if (req.query.routeId) filter.routeId = req.query.routeId;

        const schedules = await Schedule.find(filter)
            .populate('busId', 'busNumber')
            .populate('routeId', 'routeNumber routeName')
            .populate('stopId', 'stopName name')
            .sort({ busId: 1, stopSequence: 1 });

        return res.json(schedules);
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

router.delete('/schedules/:id', requireAuth(['authority']), async (req, res) => {
    try {
        const schedule = await Schedule.findByIdAndDelete(req.params.id);
        if (!schedule) {
            return sendError(res, 'Schedule not found', 404);
        }

        await recordAudit({
            req,
            action: 'schedule.delete',
            entityType: 'Schedule',
            entityId: schedule._id
        });

        return res.json({ msg: 'Schedule deleted successfully' });
    } catch (err) {
        console.error(err.message);
        return sendError(res, 'Server Error');
    }
});

// POST /api/data/buses (CORRECTED VERSION)
router.post('/buses', requireAuth(['authority']), async (req, res) => {
    try {
        const { busNumber, stops: stopNames = [], departureTime, arrivalTime, seatsAvailable, routeNumber } = req.body;

        let bus = await Bus.findOne({ busNumber });
        if (bus) {
            return res.status(400).json({ msg: 'Bus with this number already exists' });
        }

        // This new logic finds stop IDs while keeping the original order
        const stopIds = [];
        for (const name of stopNames) {
            const stop = await Stop.findOne(stopQuery(name));
            if (!stop) {
                return res.status(404).json({ msg: `Stop not found: ${name}` });
            }
            stopIds.push(stop._id);
        }

        const route = routeNumber ? await Route.findOne({ routeNumber }) : null;

        bus = new Bus({
            busNumber,
            routeId: routeNumber,
            route: route?._id,
            stops: stopIds, // Use the correctly ordered array of IDs
            departureTime,
            arrivalTime,
            seatsAvailable,
            totalSeats: Math.max(Number(seatsAvailable) || 30, Number(seatsAvailable) || 30)
        });

        await bus.save();
        res.status(201).json({ msg: 'Bus added successfully in correct order', bus });

    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});

// GET /api/data/buses (Same as before)
router.get('/buses', async (req, res) => {
    try {
        const buses = await Bus.find().populate('stops');
        res.json(buses);
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


// DELETE /api/data/buses (NEW FUNCTION to clear data for testing)
router.delete('/buses', async (req, res) => {
    try {
        await Bus.deleteMany({}); // Deletes all documents in the Bus collection
        res.json({ msg: 'All buses deleted successfully' });
    } catch (err) {
        console.error(err.message);
        res.status(500).send('Server Error');
    }
});


module.exports = router;
