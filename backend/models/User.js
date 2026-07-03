// backend/models/User.js

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    email: {
        type: String,
        required: true,
        unique: true // Ensures no two users can have the same email
    },
    password: {
        type: String,
        required: true
    },
    role: {
        type: String,
        enum: ['passenger', 'driver', 'authority'],
        default: 'passenger',
        index: true
    },
    driverId: {
        type: String,
        trim: true,
        index: true
    },
    failedLoginAttempts: {
        type: Number,
        default: 0,
        min: 0
    },
    lockedUntil: {
        type: Date,
        default: null,
        index: true
    },
    lastLoginAt: {
        type: Date,
        default: null
    },
    isActive: {
        type: Boolean,
        default: true
    },
    date: {
        type: Date,
        default: Date.now // Automatically sets the date when a user is created
    }
});

module.exports = mongoose.model('User', UserSchema);
