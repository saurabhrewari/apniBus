const express = require('express');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { requireAuth } = require('../middleware/auth');
const { sendError, sendSuccess } = require('../utils/apiResponse');
const { signToken } = require('../utils/token');
const { recordAudit } = require('../utils/audit');

const router = express.Router();
const MAX_FAILED_LOGINS = 5;
const LOCK_TIME_MS = 1000 * 60 * 15;

function publicUser(user) {
    return {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        driverId: user.driverId,
        isActive: user.isActive
    };
}

function validatePassword(password) {
    const value = String(password || '');
    const errors = [];

    if (value.length < 8) {
        errors.push('Password must be at least 8 characters');
    }
    if (!/[A-Za-z]/.test(value)) {
        errors.push('Password must include a letter');
    }
    if (!/[0-9]/.test(value)) {
        errors.push('Password must include a number');
    }

    return errors;
}

router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role = 'passenger', driverId } = req.body;

        if (!name || !email || !password) {
            return sendError(res, 'name, email, and password are required', 400);
        }

        const passwordErrors = validatePassword(password);
        if (passwordErrors.length > 0) {
            return sendError(res, 'Password policy failed', 400, passwordErrors);
        }

        if (!['passenger', 'driver', 'authority'].includes(role)) {
            return sendError(res, 'Invalid user role', 400);
        }

        const existingUser = await User.findOne({ email: String(email).toLowerCase() });
        if (existingUser) {
            return sendError(res, 'User with this email already exists', 400);
        }

        const salt = await bcrypt.genSalt(12);
        const user = await User.create({
            name,
            email: String(email).toLowerCase(),
            password: await bcrypt.hash(password, salt),
            role,
            driverId
        });

        await recordAudit({
            req,
            actorId: user._id,
            actorRole: user.role,
            action: 'user.register',
            entityType: 'User',
            entityId: user._id,
            entityLabel: user.email,
            metadata: { role: user.role, driverId: user.driverId || null }
        });

        const token = signToken({
            id: user._id,
            email: user.email,
            role: user.role,
            driverId: user.driverId
        });

        return sendSuccess(res, { user: publicUser(user), token }, 'User registered successfully', 201);
    } catch (err) {
        console.error('Register error:', err.message);
        return sendError(res, 'Server Error');
    }
});

router.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return sendError(res, 'email and password are required', 400);
        }

        const user = await User.findOne({ email: String(email).toLowerCase() });
        if (!user || !user.isActive) {
            return sendError(res, 'Invalid Credentials', 400);
        }

        if (user.lockedUntil && user.lockedUntil > new Date()) {
            return sendError(res, 'Account is temporarily locked. Try again later.', 423);
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            user.failedLoginAttempts = Number(user.failedLoginAttempts || 0) + 1;
            if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
                user.lockedUntil = new Date(Date.now() + LOCK_TIME_MS);
            }
            await user.save();
            return sendError(res, 'Invalid Credentials', 400);
        }

        user.failedLoginAttempts = 0;
        user.lockedUntil = null;
        user.lastLoginAt = new Date();
        await user.save();

        await recordAudit({
            req,
            actorId: user._id,
            actorRole: user.role,
            action: 'user.login',
            entityType: 'User',
            entityId: user._id,
            entityLabel: user.email
        });

        const token = signToken({
            id: user._id,
            email: user.email,
            role: user.role,
            driverId: user.driverId
        });

        return sendSuccess(res, { user: publicUser(user), token }, 'Login Successful');
    } catch (err) {
        console.error('Login error:', err.message);
        return sendError(res, 'Server Error');
    }
});

router.get('/me', requireAuth(), async (req, res) => {
    if (!req.user) {
        return sendSuccess(res, { user: null }, 'No active session');
    }

    const user = await User.findById(req.user.id).select('-password');
    return sendSuccess(res, { user }, 'Current user loaded');
});

module.exports = router;
