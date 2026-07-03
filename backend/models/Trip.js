const mongoose = require('mongoose');

const TripLocationSchema = new mongoose.Schema(
    {
        latitude: {
            type: Number,
            min: -90,
            max: 90
        },
        longitude: {
            type: Number,
            min: -180,
            max: 180
        },
        speedKmph: {
            type: Number,
            min: 0
        },
        capturedAt: {
            type: Date,
            default: Date.now
        }
    },
    { _id: false }
);

const TripSchema = new mongoose.Schema(
    {
        tripCode: {
            type: String,
            required: true,
            unique: true,
            index: true
        },
        bus: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Bus',
            required: true,
            index: true
        },
        busNumber: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        route: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Route',
            index: true
        },
        routeNumber: {
            type: String,
            trim: true,
            index: true
        },
        driverId: {
            type: String,
            trim: true,
            index: true
        },
        status: {
            type: String,
            enum: ['scheduled', 'running', 'completed', 'cancelled', 'offline'],
            default: 'running',
            index: true
        },
        startedAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        endedAt: {
            type: Date,
            default: null
        },
        lastSeenAt: {
            type: Date,
            default: Date.now,
            index: true
        },
        lastLocation: {
            type: TripLocationSchema,
            default: null
        },
        lastStopIndex: {
            type: Number,
            default: 0,
            min: 0
        },
        locationUpdateCount: {
            type: Number,
            default: 0,
            min: 0
        },
        manualCheckInCount: {
            type: Number,
            default: 0,
            min: 0
        },
        seatChangeCount: {
            type: Number,
            default: 0,
            min: 0
        }
    },
    { timestamps: true }
);

TripSchema.index({ bus: 1, status: 1, startedAt: -1 });
TripSchema.index({ route: 1, status: 1, startedAt: -1 });
TripSchema.index({ driverId: 1, status: 1, startedAt: -1 });

module.exports = mongoose.model('Trip', TripSchema);
