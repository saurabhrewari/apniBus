const mongoose = require('mongoose');

const LocationHistorySchema = new mongoose.Schema(
    {
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
        trip: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Trip',
            index: true
        },
        location: {
            latitude: {
                type: Number,
                required: true,
                min: -90,
                max: 90
            },
            longitude: {
                type: Number,
                required: true,
                min: -180,
                max: 180
            }
        },
        geo: {
            type: {
                type: String,
                enum: ['Point'],
                default: 'Point'
            },
            coordinates: {
                type: [Number],
                required: true
            }
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
    { timestamps: true }
);

LocationHistorySchema.pre('validate', function syncGeoPoint(next) {
    if (this.location?.latitude !== undefined && this.location?.longitude !== undefined) {
        this.geo = {
            type: 'Point',
            coordinates: [
                Number(this.location.longitude),
                Number(this.location.latitude)
            ]
        };
    }

    next();
});

LocationHistorySchema.index({ geo: '2dsphere' });
LocationHistorySchema.index({ capturedAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 30 });
LocationHistorySchema.index({ bus: 1, capturedAt: -1 });
LocationHistorySchema.index({ route: 1, capturedAt: -1 });

module.exports = mongoose.model('LocationHistory', LocationHistorySchema);
