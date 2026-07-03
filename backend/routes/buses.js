const express = require('express');
const router = express.Router();
const Bus = require('../models/Bus');
const Route = require('../models/Route');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');
const { recordAudit } = require('../utils/audit');

function parseLocation(currentLocation) {
    if (!currentLocation) {
        return null;
    }

    const latitude = Number(currentLocation.latitude);
    const longitude = Number(currentLocation.longitude);

    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
        return null;
    }

    return { latitude, longitude };
}

function normalizeSeatPayload(body) {
    const totalSeats = Number(body.totalSeats);
    const occupiedSeats = Number(body.occupiedSeats);
    const seatsAvailable = Number(body.seatsAvailable);
    const updates = {};

    if (Number.isFinite(totalSeats)) {
        updates.totalSeats = Math.max(totalSeats, 0);
    }

    if (Number.isFinite(occupiedSeats)) {
        updates.occupiedSeats = Math.max(occupiedSeats, 0);
    } else if (Number.isFinite(seatsAvailable) && Number.isFinite(totalSeats)) {
        updates.occupiedSeats = Math.max(totalSeats - seatsAvailable, 0);
    }

    return updates;
}

router.post('/', requireAuth(['authority']), async (req, res) => {
    try {
        const {
            busNumber,
            routeId,
            routeNumber,
            currentLocation,
            seatsAvailable,
            occupiedSeats,
            totalSeats,
            model,
            busType,
            assignedDriverId
        } = req.body;

        if (!busNumber) {
            return sendError(res, 'busNumber is required', 400);
        }

        const location = currentLocation ? parseLocation(currentLocation) : null;
        if (currentLocation && !location) {
            return sendError(res, 'currentLocation must include valid latitude and longitude', 400);
        }

        const existingBus = await Bus.findOne({ busNumber });
        if (existingBus) {
            return sendError(res, 'Bus with this number already exists', 400);
        }

        const route = routeNumber ? await Route.findOne({ routeNumber }) : null;
        const routeStops = route?.stops || [];
        const bus = await Bus.create({
            busNumber,
            routeId: routeId || routeNumber,
            route: route?._id,
            stops: routeStops,
            currentLocation: location,
            seatsAvailable,
            occupiedSeats,
            totalSeats,
            model,
            busType,
            assignedDriverId
        });

        await recordAudit({
            req,
            action: 'bus.create',
            entityType: 'Bus',
            entityId: bus._id,
            entityLabel: bus.busNumber,
            metadata: {
                routeNumber: route?.routeNumber || routeId || routeNumber || null,
                totalSeats: bus.totalSeats,
                assignedDriverId: bus.assignedDriverId || null
            }
        });

        res.status(201).json(bus);
    } catch (err) {
        console.error('Error creating bus:', err.message);
        return sendError(res, 'Server Error');
    }
});

router.get('/', async (req, res) => {
    try {
        const buses = await Bus.find()
            .select('busNumber model busType routeId route stops currentLocation currentStopIndex seatsAvailable occupiedSeats totalSeats assignedDriverId isJourneyActive isActive liveStatus lastActiveAt lastEta updatedAt')
            .populate('stops')
            .populate({
                path: 'route',
                populate: { path: 'stops' }
            })
            .sort({ createdAt: -1 });

        res.json(buses);
    } catch (err) {
        console.error('Error fetching buses:', err.message);
        return sendError(res, 'Server Error');
    }
});

router.patch('/:id', requireAuth(['authority', 'driver']), async (req, res) => {
    try {
        const { routeNumber } = req.body;
        const updates = { ...req.body, ...normalizeSeatPayload(req.body) };

        if (routeNumber) {
            const route = await Route.findOne({ routeNumber });
            if (!route) {
                return sendError(res, 'Route not found', 404);
            }

            updates.route = route._id;
            updates.routeId = route.routeNumber;
            updates.stops = route.stops;
        }

        delete updates.routeNumber;
        delete updates.seatsAvailable;

        let bus = await Bus.findById(req.params.id);
        if (!bus) {
            return sendError(res, 'Bus not found', 404);
        }

        Object.assign(bus, updates);
        await bus.save();

        await recordAudit({
            req,
            action: 'bus.update',
            entityType: 'Bus',
            entityId: bus._id,
            entityLabel: bus.busNumber,
            metadata: {
                updatedFields: Object.keys(updates)
            }
        });

        bus = await Bus.findById(bus._id)
            .populate('stops')
            .populate({
                path: 'route',
                populate: { path: 'stops' }
            });

        res.json(bus);
    } catch (err) {
        console.error('Error updating bus:', err.message);
        return sendError(res, 'Server Error');
    }
});

router.patch('/:id/seats', requireAuth(['authority', 'driver']), async (req, res) => {
    try {
        const bus = await Bus.findById(req.params.id);
        if (!bus) {
            return sendError(res, 'Bus not found', 404);
        }

        const totalSeats = Number(req.body.totalSeats ?? bus.totalSeats) || 0;
        const occupiedSeats = Number(req.body.occupiedSeats);
        const delta = Number(req.body.delta);

        bus.totalSeats = Math.max(totalSeats, 0);
        if (Number.isFinite(occupiedSeats)) {
            bus.occupiedSeats = occupiedSeats;
        } else if (Number.isFinite(delta)) {
            bus.occupiedSeats = Number(bus.occupiedSeats || 0) + delta;
        }

        if (typeof req.body.isActive === 'boolean') {
            bus.isActive = req.body.isActive;
        }

        await bus.save();

        await recordAudit({
            req,
            action: 'bus.seats.update',
            entityType: 'Bus',
            entityId: bus._id,
            entityLabel: bus.busNumber,
            metadata: {
                totalSeats: bus.totalSeats,
                occupiedSeats: bus.occupiedSeats,
                seatsAvailable: bus.seatsAvailable
            }
        });

        return res.json({
            msg: 'Seat count updated',
            bus,
            seatSummary: {
                totalSeats: bus.totalSeats,
                occupiedSeats: bus.occupiedSeats,
                seatsAvailable: bus.seatsAvailable,
                seatStatus: bus.seatsAvailable > 0 ? 'Available' : 'Full'
            }
        });
    } catch (err) {
        console.error('Error updating seats:', err.message);
        return sendError(res, 'Server Error');
    }
});

router.delete('/:id', requireAuth(['authority']), async (req, res) => {
    try {
        const bus = await Bus.findByIdAndDelete(req.params.id);
        if (!bus) {
            return sendError(res, 'Bus not found', 404);
        }

        await recordAudit({
            req,
            action: 'bus.delete',
            entityType: 'Bus',
            entityId: bus._id,
            entityLabel: bus.busNumber
        });

        res.json({ msg: 'Bus removed successfully' });
    } catch (err) {
        console.error('Error deleting bus:', err.message);
        return sendError(res, 'Server Error');
    }
});

module.exports = router;
