// ============== BASIC SETUP ==============
require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const http = require('http');
const socketio = require('socket.io');
const Bus = require('./models/Bus');
const LocationHistory = require('./models/LocationHistory');
const Route = require('./models/Route');
const Schedule = require('./models/Schedule');
const Trip = require('./models/Trip');
const {
    createRateLimiter,
    errorHandler,
    notFoundHandler,
    requestLogger,
    securityHeaders
} = require('./middleware/ops');
const { validateCoordinates } = require('./middleware/validate');
const { calculateEtaForBus, serializeStop } = require('./utils/tracking');
const { recordAudit } = require('./utils/audit');
const { verifyToken } = require('./utils/token');

function hasEta(value) {
    return value && Number.isFinite(Number(value.etaMinutes));
}

function getRouteRoom(bus) {
    const routeKey = bus?.route?.routeNumber || bus?.routeId || bus?.routeNumber;
    return routeKey ? `route:${routeKey}` : null;
}

function getStopName(stop) {
    return stop?.stopName || stop?.name || 'Stop';
}

function getSeatSummary(bus) {
    const totalSeats = Number(bus.totalSeats) || 0;
    const occupiedSeats = Math.min(Math.max(Number(bus.occupiedSeats) || 0, 0), totalSeats);
    const seatsAvailable = Math.max(totalSeats - occupiedSeats, 0);

    return {
        totalSeats,
        occupiedSeats,
        seatsAvailable,
        seatStatus: seatsAvailable > 0 ? 'Available' : 'Full'
    };
}

function emitBusPayload(io, bus, payload) {
    const routeRoom = getRouteRoom(bus);
    if (routeRoom) {
        io.to(routeRoom).emit('route-location', payload);
        io.to(routeRoom).emit('bus-state', payload);
    }

    io.emit('broadcast-location', payload);
    io.emit('update-location', payload);
    io.emit('fleet-state', payload);
}

function createTripCode(busNumber) {
    const cleanBusNumber = String(busNumber || 'BUS').replace(/[^a-z0-9]/gi, '').toUpperCase();
    return `${cleanBusNumber}-${Date.now().toString(36).toUpperCase()}`;
}

async function getOrStartTrip({ bus, route, routeNumber, driverId, location, speedKmph }) {
    const query = {
        bus: bus._id,
        status: 'running'
    };

    let trip = await Trip.findOne(query).sort({ startedAt: -1 });
    const capturedAt = new Date();

    if (!trip) {
        trip = await Trip.create({
            tripCode: createTripCode(bus.busNumber),
            bus: bus._id,
            busNumber: bus.busNumber,
            route: route?._id || bus.route?._id || bus.route,
            routeNumber: routeNumber || route?.routeNumber || bus.routeId,
            driverId,
            status: 'running',
            startedAt: capturedAt,
            lastSeenAt: capturedAt,
            lastLocation: {
                ...location,
                speedKmph,
                capturedAt
            },
            lastStopIndex: bus.currentStopIndex || 0,
            locationUpdateCount: 1
        });
        return trip;
    }

    trip.route = route?._id || trip.route || bus.route?._id || bus.route;
    trip.routeNumber = routeNumber || trip.routeNumber || route?.routeNumber || bus.routeId;
    trip.driverId = driverId || trip.driverId;
    trip.lastSeenAt = capturedAt;
    trip.lastLocation = {
        ...location,
        speedKmph,
        capturedAt
    };
    trip.lastStopIndex = bus.currentStopIndex || trip.lastStopIndex || 0;
    trip.locationUpdateCount = Number(trip.locationUpdateCount || 0) + 1;
    await trip.save();
    return trip;
}

async function recordLocationHistory({ bus, trip, route, routeNumber, driverId, location, speedKmph }) {
    try {
        await LocationHistory.create({
            bus: bus._id,
            busNumber: bus.busNumber,
            route: route?._id || bus.route?._id || bus.route,
            routeNumber: routeNumber || route?.routeNumber || bus.routeId,
            driverId,
            trip: trip?._id,
            location,
            speedKmph: Number.isFinite(Number(speedKmph)) ? Number(speedKmph) : undefined
        });
    } catch (error) {
        console.error('Location history write failed:', error.message);
    }
}

const app = express();
const server = http.createServer(app);
const PORT = process.env.PORT || 5001;

function corsOrigin(origin, callback) {
    if (!origin) {
        callback(null, true);
        return;
    }

    const allowedOrigins = String(process.env.CORS_ORIGINS || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean);

    if (allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
    }

    const isLocalDevOrigin = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/.test(origin);
    if (isLocalDevOrigin) {
        callback(null, true);
        return;
    }

    callback(new Error('Not allowed by CORS'));
}

// ============== CORS & SOCKET.IO SETUP ==============
app.use(cors({ origin: corsOrigin }));
const io = new socketio.Server(server, {
    cors: {
        origin: corsOrigin,
        methods: ["GET", "POST"]
    }
});

io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    socket.data.user = token ? verifyToken(token) : null;

    if (token && !socket.data.user) {
        return next(new Error('Invalid or expired authentication token'));
    }

    return next();
});

// ============== MIDDLEWARE ==============
app.use(securityHeaders);
app.use(requestLogger);
app.use('/api', createRateLimiter({
    windowMs: Number(process.env.RATE_LIMIT_WINDOW_MS) || 1000 * 60,
    maxRequests: Number(process.env.RATE_LIMIT_MAX) || 180
}));
app.use(express.json({ limit: '100kb' }));

app.get('/api/health', (_req, res) => {
    const mongoStates = {
        0: 'disconnected',
        1: 'connected',
        2: 'connecting',
        3: 'disconnecting'
    };

    res.json({
        success: true,
        service: 'apnibus-backend',
        status: 'ok',
        mongoState: mongoose.connection.readyState,
        mongoStatus: mongoStates[mongoose.connection.readyState] || 'unknown',
        uptimeSeconds: Math.round(process.uptime()),
        timestamp: new Date().toISOString()
    });
});

// ============== API ROUTES ==============
app.use('/api/users', require('./routes/users'));
app.use('/api/data', require('./routes/data'));
app.use('/api/journey', require('./routes/journey'));
app.use('/api/buses', require('./routes/buses'));
app.use('/api/search', require('./routes/search'));
app.use('/api/analytics', require('./routes/analytics'));
app.use('/api/operations', require('./routes/operations'));

// ============== SERVE FRONTEND STATIC FILES (THE FINAL FIX) ==============
// This is the most important part. It correctly serves your main files
// and your 'public' folder assets.
const frontendRootPath = path.join(__dirname, '..', 'frontend');
const frontendBuildPath = path.join(frontendRootPath, 'dist');

if (fs.existsSync(frontendBuildPath)) {
    app.use(express.static(frontendBuildPath));
    app.get(/^(?!\/api|\/socket\.io).*/, (req, res) => {
        res.sendFile(path.join(frontendBuildPath, 'index.html'));
    });
}

app.use('/public', express.static(path.join(frontendRootPath, 'public')));
app.use('/api', notFoundHandler);
app.use(errorHandler);


// ============== DATABASE CONNECTION ==============
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log("MongoDB connected successfully!"))
    .catch(err => console.error('MongoDB connection error:', err));

// ============== OFFLINE DETECTION ==============
const OFFLINE_WINDOW_MS = Number(process.env.BUS_OFFLINE_AFTER_MS) || 1000 * 60 * 3;
setInterval(async () => {
    try {
        const staleBefore = new Date(Date.now() - OFFLINE_WINDOW_MS);
        const staleBuses = await Bus.find({
            liveStatus: 'online',
            lastActiveAt: { $lt: staleBefore }
        }).select('_id busNumber routeId route liveStatus isJourneyActive lastActiveAt');

        if (staleBuses.length === 0) {
            return;
        }

        const staleBusIds = staleBuses.map((bus) => bus._id);
        await Bus.updateMany(
            { _id: { $in: staleBusIds } },
            {
                $set: {
                    liveStatus: 'offline',
                    isJourneyActive: false
                }
            }
        );

        await Trip.updateMany(
            { bus: { $in: staleBusIds }, status: 'running' },
            {
                $set: {
                    status: 'offline',
                    endedAt: new Date()
                }
            }
        );

        for (const bus of staleBuses) {
            const payload = {
                busId: bus._id,
                busNumber: bus.busNumber,
                routeId: bus.routeId,
                liveStatus: 'offline',
                isJourneyActive: false,
                lastActiveAt: bus.lastActiveAt,
                updatedAt: new Date()
            };
            emitBusPayload(io, bus, payload);
        }
    } catch (error) {
        console.error('Offline detection error:', error.message);
    }
}, Math.min(OFFLINE_WINDOW_MS, 1000 * 60));

// ============== REAL-TIME TRACKING LOGIC ==============
io.on("connection", function (socket) {
    console.log(`A user connected via WebSocket`);

    function canMutateBus(bus) {
        if (String(process.env.REQUIRE_AUTH || '').toLowerCase() !== 'true') {
            return true;
        }

        const user = socket.data.user;
        if (!user || !['driver', 'authority'].includes(user.role)) {
            socket.emit('location-error', { msg: 'Authenticated driver access is required.' });
            return false;
        }

        if (
            user.role === 'driver' &&
            bus?.assignedDriverId &&
            user.driverId &&
            String(bus.assignedDriverId) !== String(user.driverId)
        ) {
            socket.emit('location-error', { msg: 'This bus is not assigned to your driver account.' });
            return false;
        }

        return true;
    }

    socket.on('join-route', (routeId) => {
        if (!routeId) {
            return;
        }

        socket.join(`route:${routeId}`);
    });

    async function handleLocationUpdate(data = {}) {
        try {
            const { busId, busNumber, routeNumber, latitude, longitude, speedKmph, driverId } = data;
            const parsedLatitude = Number(latitude);
            const parsedLongitude = Number(longitude);

            if ((!busId && !busNumber) || !validateCoordinates(parsedLatitude, parsedLongitude)) {
                socket.emit('location-error', {
                    msg: 'busId or busNumber with valid latitude and longitude is required'
                });
                return;
            }

            const query = busId ? { _id: busId } : { busNumber };
            const existingBus = await Bus.findOne(query)
                .populate('stops')
                .populate({
                    path: 'route',
                    populate: { path: 'stops' }
                });

            if (!existingBus) {
                socket.emit('location-error', { msg: 'Bus not found' });
                return;
            }

            if (!canMutateBus(existingBus)) {
                return;
            }

            const route = routeNumber ? await Route.findOne({ routeNumber }) : null;
            const locationSet = {
                currentLocation: {
                    latitude: parsedLatitude,
                    longitude: parsedLongitude
                },
                liveStatus: 'online',
                isJourneyActive: true,
                lastActiveAt: new Date()
            };

            if (Number.isFinite(Number(speedKmph)) && Number(speedKmph) > 0) {
                locationSet.averageSpeedKmph = Math.max(Number(speedKmph), 5);
            }

            if (route) {
                locationSet.route = route._id;
                locationSet.routeId = route.routeNumber;
                locationSet.stops = route.stops;
            }

            let updatedBus = await Bus.findOneAndUpdate(
                query,
                {
                    $set: locationSet
                },
                {
                    new: true,
                    runValidators: true
                }
            )
                .populate('stops')
                .populate({
                    path: 'route',
                    populate: { path: 'stops' }
                });

            if (!updatedBus) {
                socket.emit('location-error', { msg: 'Bus not found' });
                return;
            }

            const currentLocation = {
                latitude: parsedLatitude,
                longitude: parsedLongitude
            };
            const trip = await getOrStartTrip({
                bus: updatedBus,
                route: updatedBus.route || route,
                routeNumber,
                driverId,
                location: currentLocation,
                speedKmph: Number(speedKmph)
            });
            await recordLocationHistory({
                bus: updatedBus,
                trip,
                route: updatedBus.route || route,
                routeNumber,
                driverId,
                location: currentLocation,
                speedKmph: Number(speedKmph)
            });

            const routeStops = updatedBus.route?.stops?.length ? updatedBus.route.stops : updatedBus.stops;
            const schedules = await Schedule.find({ busId: updatedBus._id })
                .sort({ stopSequence: 1 })
                .lean();
            const eta = calculateEtaForBus(
                { ...updatedBus.toObject(), stops: routeStops },
                schedules,
                updatedBus.currentLocation
            );

            if (eta) {
                updatedBus = await Bus.findByIdAndUpdate(
                    updatedBus._id,
                    {
                        $set: {
                            currentStopIndex: eta.nextStopIndex,
                            lastEta: {
                                nextStopId: eta.nextStopId,
                                nextStopName: eta.nextStopName,
                                distanceKm: eta.distanceKm,
                                etaMinutes: eta.etaMinutes,
                                status: eta.status,
                                delayMinutes: eta.delayMinutes,
                                calculatedAt: eta.calculatedAt
                            }
                        }
                    },
                    { new: true }
                )
                    .populate('stops')
                    .populate({
                        path: 'route',
                        populate: { path: 'stops' }
                    });
            }

            const currentRouteStops = updatedBus.route?.stops?.length ? updatedBus.route.stops : updatedBus.stops;
            const seatSummary = getSeatSummary(updatedBus);

            const locationPayload = {
                busId: updatedBus._id,
                busNumber: updatedBus.busNumber,
                tripId: trip?._id,
                tripCode: trip?.tripCode,
                routeId: updatedBus.routeId,
                routeNumber: updatedBus.route?.routeNumber || updatedBus.routeId,
                routeName: updatedBus.route?.routeName,
                origin: updatedBus.route?.origin,
                destination: updatedBus.route?.destination,
                stops: currentRouteStops.map(serializeStop),
                currentStopIndex: updatedBus.currentStopIndex,
                currentLocation: updatedBus.currentLocation,
                seatsAvailable: seatSummary.seatsAvailable,
                occupiedSeats: seatSummary.occupiedSeats,
                totalSeats: seatSummary.totalSeats,
                seatStatus: seatSummary.seatStatus,
                liveStatus: updatedBus.liveStatus,
                isJourneyActive: updatedBus.isJourneyActive,
                isActive: updatedBus.isActive,
                lastActiveAt: updatedBus.lastActiveAt,
                eta: hasEta(eta) ? eta : hasEta(updatedBus.lastEta) ? updatedBus.lastEta : null,
                updatedAt: updatedBus.updatedAt
            };

            emitBusPayload(io, updatedBus, locationPayload);
        } catch (error) {
            console.error('Socket location update error:', error.message);
            socket.emit('location-error', { msg: 'Unable to update bus location' });
        }
    }

    async function handleManualCheckIn(data = {}) {
        try {
            const { busId, busNumber, stopId, stopIndex } = data;
            if (!busId && !busNumber) {
                socket.emit('location-error', { msg: 'busId or busNumber is required for check-in' });
                return;
            }

            const query = busId ? { _id: busId } : { busNumber };
            const bus = await Bus.findOne(query)
                .populate('stops')
                .populate({
                    path: 'route',
                    populate: { path: 'stops' }
                });

            if (!bus) {
                socket.emit('location-error', { msg: 'Bus not found' });
                return;
            }

            if (!canMutateBus(bus)) {
                return;
            }

            const routeStops = bus.route?.stops?.length ? bus.route.stops : bus.stops;
            let checkedIndex = Number.isInteger(Number(stopIndex)) ? Number(stopIndex) : -1;

            if (checkedIndex < 0 && stopId) {
                checkedIndex = routeStops.findIndex((stop) => String(stop._id) === String(stopId));
            }

            if (checkedIndex < 0 || checkedIndex >= routeStops.length) {
                socket.emit('location-error', { msg: 'Stop not found on this route' });
                return;
            }

            const nextStopIndex = Math.min(checkedIndex + 1, Math.max(routeStops.length - 1, 0));
            const checkedStop = routeStops[checkedIndex];
            await Trip.findOneAndUpdate(
                { bus: bus._id, status: 'running' },
                {
                    $set: {
                        lastSeenAt: new Date(),
                        lastStopIndex: nextStopIndex
                    },
                    $inc: { manualCheckInCount: 1 }
                },
                { sort: { startedAt: -1 } }
            );
            const updatedBus = await Bus.findByIdAndUpdate(
                bus._id,
                {
                    $set: {
                        currentStopIndex: nextStopIndex,
                        lastEta: {
                            nextStopId: routeStops[nextStopIndex]?._id,
                            nextStopName: getStopName(routeStops[nextStopIndex]),
                            distanceKm: 0,
                            etaMinutes: 0,
                            status: 'On Time',
                            delayMinutes: 0,
                            calculatedAt: new Date()
                        }
                    }
                },
                { new: true }
            )
                .populate('stops')
                .populate({
                    path: 'route',
                    populate: { path: 'stops' }
                });

            const currentRouteStops = updatedBus.route?.stops?.length ? updatedBus.route.stops : updatedBus.stops;
            const seatSummary = getSeatSummary(updatedBus);
            const payload = {
                busId: updatedBus._id,
                busNumber: updatedBus.busNumber,
                routeId: updatedBus.routeId,
                routeNumber: updatedBus.route?.routeNumber || updatedBus.routeId,
                routeName: updatedBus.route?.routeName,
                origin: updatedBus.route?.origin,
                destination: updatedBus.route?.destination,
                stops: currentRouteStops.map(serializeStop),
                currentStopIndex: updatedBus.currentStopIndex,
                currentLocation: updatedBus.currentLocation,
                seatsAvailable: seatSummary.seatsAvailable,
                occupiedSeats: seatSummary.occupiedSeats,
                totalSeats: seatSummary.totalSeats,
                seatStatus: seatSummary.seatStatus,
                liveStatus: updatedBus.liveStatus,
                isJourneyActive: updatedBus.isJourneyActive,
                isActive: updatedBus.isActive,
                lastActiveAt: updatedBus.lastActiveAt,
                eta: hasEta(updatedBus.lastEta) ? updatedBus.lastEta : null,
                landmark: `Arrived at ${getStopName(checkedStop)}`,
                updatedAt: updatedBus.updatedAt
            };

            emitBusPayload(io, updatedBus, payload);
            await recordAudit({
                actorId: data.driverId || bus.assignedDriverId || 'driver',
                actorRole: 'driver',
                action: 'trip.manualCheckIn',
                entityType: 'Bus',
                entityId: updatedBus._id,
                entityLabel: updatedBus.busNumber,
                metadata: {
                    stopIndex: checkedIndex,
                    stopName: getStopName(checkedStop)
                }
            });
            socket.emit('check-in-confirmed', payload);
        } catch (error) {
            console.error('Manual check-in error:', error.message);
            socket.emit('location-error', { msg: 'Unable to confirm stop arrival' });
        }
    }

    async function handleSeatUpdate(data = {}) {
        try {
            const { busId, busNumber, occupiedSeats, delta, totalSeats, isActive } = data;
            if (!busId && !busNumber) {
                socket.emit('seat-error', { msg: 'busId or busNumber is required' });
                return;
            }

            const query = busId ? { _id: busId } : { busNumber };
            const bus = await Bus.findOne(query)
                .populate('stops')
                .populate({
                    path: 'route',
                    populate: { path: 'stops' }
                });

            if (!bus) {
                socket.emit('seat-error', { msg: 'Bus not found' });
                return;
            }

            if (!canMutateBus(bus)) {
                return;
            }

            if (Number.isFinite(Number(totalSeats))) {
                bus.totalSeats = Math.max(Number(totalSeats), 0);
            }

            if (Number.isFinite(Number(occupiedSeats))) {
                bus.occupiedSeats = Number(occupiedSeats);
            } else if (Number.isFinite(Number(delta))) {
                bus.occupiedSeats = Number(bus.occupiedSeats || 0) + Number(delta);
            }

            if (typeof isActive === 'boolean') {
                bus.isActive = isActive;
            }

            bus.lastActiveAt = new Date();
            await bus.save();
            await Trip.findOneAndUpdate(
                { bus: bus._id, status: 'running' },
                {
                    $set: { lastSeenAt: new Date() },
                    $inc: { seatChangeCount: 1 }
                },
                { sort: { startedAt: -1 } }
            );

            const currentRouteStops = bus.route?.stops?.length ? bus.route.stops : bus.stops;
            const seatSummary = getSeatSummary(bus);
            const payload = {
                busId: bus._id,
                busNumber: bus.busNumber,
                routeId: bus.routeId,
                routeNumber: bus.route?.routeNumber || bus.routeId,
                routeName: bus.route?.routeName,
                origin: bus.route?.origin,
                destination: bus.route?.destination,
                stops: currentRouteStops.map(serializeStop),
                currentStopIndex: bus.currentStopIndex,
                currentLocation: bus.currentLocation,
                ...seatSummary,
                liveStatus: bus.liveStatus,
                isJourneyActive: bus.isJourneyActive,
                isActive: bus.isActive,
                lastActiveAt: bus.lastActiveAt,
                eta: hasEta(bus.lastEta) ? bus.lastEta : null,
                updatedAt: bus.updatedAt
            };

            emitBusPayload(io, bus, payload);
            await recordAudit({
                actorId: data.driverId || bus.assignedDriverId || 'driver',
                actorRole: 'driver',
                action: 'bus.seats.socketUpdate',
                entityType: 'Bus',
                entityId: bus._id,
                entityLabel: bus.busNumber,
                metadata: seatSummary
            });
            socket.emit('seat-updated', payload);
        } catch (error) {
            console.error('Seat update error:', error.message);
            socket.emit('seat-error', { msg: 'Unable to update seats' });
        }
    }

    socket.on('receive-location', handleLocationUpdate);
    socket.on('send-location', handleLocationUpdate);
    socket.on('manual-check-in', handleManualCheckIn);
    socket.on('seat-update', handleSeatUpdate);
    socket.on('stop-trip', async (data = {}) => {
        try {
            const { busId, busNumber } = data;
            if (!busId && !busNumber) {
                return;
            }

            const bus = await Bus.findOne(busId ? { _id: busId } : { busNumber });
            if (!bus) {
                return;
            }

            if (!canMutateBus(bus)) {
                return;
            }

            await Trip.findOneAndUpdate(
                { bus: bus._id, status: 'running' },
                {
                    $set: {
                        status: 'completed',
                        endedAt: new Date(),
                        lastSeenAt: new Date()
                    }
                },
                { sort: { startedAt: -1 } }
            );

            bus.isJourneyActive = false;
            bus.liveStatus = 'idle';
            bus.lastActiveAt = new Date();
            await bus.save();

            socket.emit('trip-stopped', {
                busId: bus._id,
                busNumber: bus.busNumber,
                liveStatus: bus.liveStatus,
                isJourneyActive: bus.isJourneyActive
            });
        } catch (error) {
            console.error('Stop trip error:', error.message);
        }
    });
    socket.on("disconnect", function(){ console.log("A user disconnected"); });
});

// ============== START THE SERVER ==============
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
