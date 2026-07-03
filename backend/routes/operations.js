const express = require('express');
const AuditLog = require('../models/AuditLog');
const LocationHistory = require('../models/LocationHistory');
const Trip = require('../models/Trip');
const { requireAuth } = require('../middleware/auth');
const { sendError } = require('../utils/apiResponse');

const router = express.Router();

function limitFromQuery(value, fallback = 50, max = 200) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) {
        return fallback;
    }

    return Math.min(Math.floor(parsed), max);
}

router.get('/trips', requireAuth(['authority']), async (req, res) => {
    try {
        const filter = {};
        if (req.query.status) filter.status = req.query.status;
        if (req.query.busNumber) filter.busNumber = req.query.busNumber;
        if (req.query.routeNumber) filter.routeNumber = req.query.routeNumber;
        if (req.query.driverId) filter.driverId = req.query.driverId;

        const trips = await Trip.find(filter)
            .populate('bus', 'busNumber totalSeats occupiedSeats seatsAvailable liveStatus')
            .populate('route', 'routeNumber routeName origin destination')
            .sort({ startedAt: -1 })
            .limit(limitFromQuery(req.query.limit));

        return res.json({ success: true, trips });
    } catch (error) {
        console.error('Trips fetch error:', error.message);
        return sendError(res, 'Server Error');
    }
});

router.get('/audit-logs', requireAuth(['authority']), async (req, res) => {
    try {
        const filter = {};
        if (req.query.entityType) filter.entityType = req.query.entityType;
        if (req.query.action) filter.action = req.query.action;
        if (req.query.actorRole) filter.actorRole = req.query.actorRole;

        const logs = await AuditLog.find(filter)
            .sort({ createdAt: -1 })
            .limit(limitFromQuery(req.query.limit));

        return res.json({ success: true, logs });
    } catch (error) {
        console.error('Audit fetch error:', error.message);
        return sendError(res, 'Server Error');
    }
});

router.get('/location-history', requireAuth(['authority']), async (req, res) => {
    try {
        const filter = {};
        if (req.query.busNumber) filter.busNumber = req.query.busNumber;
        if (req.query.routeNumber) filter.routeNumber = req.query.routeNumber;
        if (req.query.driverId) filter.driverId = req.query.driverId;

        const locations = await LocationHistory.find(filter)
            .populate('bus', 'busNumber')
            .populate('route', 'routeNumber routeName')
            .sort({ capturedAt: -1 })
            .limit(limitFromQuery(req.query.limit, 100, 500));

        return res.json({ success: true, locations });
    } catch (error) {
        console.error('Location history fetch error:', error.message);
        return sendError(res, 'Server Error');
    }
});

module.exports = router;
