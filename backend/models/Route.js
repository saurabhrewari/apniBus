const mongoose = require('mongoose');

const RouteSchema = new mongoose.Schema({
    routeNumber: {
        type: String,
        required: true,
        trim: true,
        unique: true,
        index: true
    },
    routeName: {
        type: String,
        trim: true
    },
    origin: {
        type: String,
        required: true,
        trim: true
    },
    destination: {
        type: String,
        required: true,
        trim: true
    },
    stops: [{
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stop'
    }],
    segmentDistancesKm: [{
        type: Number,
        min: 0
    }],
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, { timestamps: true });

RouteSchema.index({
    routeNumber: 'text',
    routeName: 'text',
    origin: 'text',
    destination: 'text'
});

module.exports = mongoose.model('Route', RouteSchema);
