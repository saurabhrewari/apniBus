// backend/models/Bus.js
const mongoose = require('mongoose');

const LocationSchema = new mongoose.Schema(
    {
        latitude: {
            type: Number,
            required: true
        },
        longitude: {
            type: Number,
            required: true
        }
    },
    { _id: false }
);

const BusSchema = new mongoose.Schema({
    busNumber: {
        type: String,
        required: true,
        unique: true
    },
    model: {
        type: String,
        trim: true
    },
    busType: {
        type: String,
        trim: true,
        default: 'Standard'
    },
    routeId: {
        type: String,
        trim: true,
        index: true
    },
    route: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        index: true
    },
    stops: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stop'
    }],
    departureTime: {
        type: String
    },
    arrivalTime: {
        type: String
    },
    seatsAvailable: {
        type: Number,
        default: 30
    },
    occupiedSeats: {
        type: Number,
        default: 0,
        min: 0
    },
    totalSeats: {
        type: Number,
        default: 30
    },
    assignedDriverId: {
        type: String,
        trim: true
    },
    averageSpeedKmph: {
        type: Number,
        default: 28,
        min: 1
    },
    currentStopIndex: {
        type: Number,
        default: 0
    },
    currentLocation: {
        type: LocationSchema,
        default: null
    },
    isJourneyActive: {
        type: Boolean,
        default: false
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },
    liveStatus: {
        type: String,
        enum: ['offline', 'online', 'idle'],
        default: 'offline',
        index: true
    },
    lastActiveAt: {
        type: Date,
        default: null,
        index: true
    },
    lastEta: {
        nextStopId: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Stop'
        },
        nextStopName: String,
        distanceKm: Number,
        etaMinutes: Number,
        status: String,
        delayMinutes: Number,
        calculatedAt: Date
    }
}, { timestamps: true });

BusSchema.pre('validate', function normalizeSeats(next) {
    const totalSeats = Number(this.totalSeats) || 0;
    const hasOccupiedSeats = this.occupiedSeats !== undefined && this.occupiedSeats !== null;
    const derivedOccupiedSeats =
        hasOccupiedSeats
            ? Number(this.occupiedSeats)
            : totalSeats - (Number(this.seatsAvailable) || 0);
    const occupiedSeats = Math.min(Math.max(derivedOccupiedSeats || 0, 0), totalSeats);

    this.occupiedSeats = occupiedSeats;
    this.seatsAvailable = Math.max(totalSeats - occupiedSeats, 0);
    next();
});

BusSchema.index({ routeId: 1, isActive: 1 });

module.exports = mongoose.model('Bus', BusSchema);
