const mongoose = require('mongoose');

const ScheduleSchema = new mongoose.Schema({
    busId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Bus',
        required: true,
        index: true
    },
    routeId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Route',
        required: true,
        index: true
    },
    stopId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Stop',
        required: true,
        index: true
    },
    stopSequence: {
        type: Number,
        required: true,
        min: 0
    },
    arrivalTime: {
        type: String,
        required: true
    },
    departureTime: {
        type: String,
        required: true
    },
    isActive: {
        type: Boolean,
        default: true,
        index: true
    }
}, { timestamps: true });

ScheduleSchema.index({ busId: 1, stopSequence: 1 });
ScheduleSchema.index({ routeId: 1, stopId: 1 });
ScheduleSchema.index({ busId: 1, routeId: 1, stopId: 1 }, { unique: true });

module.exports = mongoose.model('Schedule', ScheduleSchema);
