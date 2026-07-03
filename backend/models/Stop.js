const mongoose = require('mongoose');

const CoordinatesSchema = new mongoose.Schema(
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
        }
    },
    { _id: false }
);

const GeoPointSchema = new mongoose.Schema(
    {
        type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
        },
        coordinates: {
            type: [Number],
            validate: {
                validator(value) {
                    return (
                        Array.isArray(value) &&
                        value.length === 2 &&
                        value.every((item) => Number.isFinite(Number(item)))
                    );
                },
                message: 'location.coordinates must be [longitude, latitude]'
            }
        }
    },
    { _id: false }
);

const StopSchema = new mongoose.Schema({
    stopName: {
        type: String,
        required: true,
        trim: true,
        unique: true
    },
    name: {
        type: String,
        trim: true
    },
    coordinates: {
        type: CoordinatesSchema,
        default: null
    },
    location: {
        type: GeoPointSchema,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, { timestamps: true });

StopSchema.pre('validate', function syncLegacyName(next) {
    if (!this.stopName && this.name) {
        this.stopName = this.name;
    }

    if (!this.name && this.stopName) {
        this.name = this.stopName;
    }

    if (this.coordinates?.latitude !== undefined && this.coordinates?.longitude !== undefined) {
        this.location = {
            type: 'Point',
            coordinates: [
                Number(this.coordinates.longitude),
                Number(this.coordinates.latitude)
            ]
        };
    }

    next();
});

StopSchema.index({ stopName: 'text', name: 'text' });
StopSchema.index({ location: '2dsphere' }, { sparse: true });

module.exports = mongoose.model('Stop', StopSchema);
