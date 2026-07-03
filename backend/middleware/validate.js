const { sendError } = require('../utils/apiResponse');

function isBlank(value) {
    return value === undefined || value === null || String(value).trim() === '';
}

function requireFields(fields) {
    return (req, res, next) => {
        const missing = fields.filter((field) => isBlank(req.body[field]));

        if (missing.length > 0) {
            return sendError(res, `Missing required fields: ${missing.join(', ')}`, 400);
        }

        return next();
    };
}

function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
}

function validateBody(rules) {
    return (req, res, next) => {
        const errors = [];

        for (const [field, rule] of Object.entries(rules)) {
            const value = req.body[field];
            const label = rule.label || field;

            if (rule.required && isBlank(value)) {
                errors.push(`${label} is required`);
                continue;
            }

            if (isBlank(value)) {
                continue;
            }

            if (rule.type === 'number') {
                const parsed = Number(value);
                if (!Number.isFinite(parsed)) {
                    errors.push(`${label} must be a valid number`);
                    continue;
                }
                if (rule.min !== undefined && parsed < rule.min) {
                    errors.push(`${label} must be at least ${rule.min}`);
                }
                if (rule.max !== undefined && parsed > rule.max) {
                    errors.push(`${label} must be at most ${rule.max}`);
                }
            }

            if (rule.type === 'string' && typeof value !== 'string') {
                errors.push(`${label} must be text`);
            }

            if (rule.type === 'array' && !Array.isArray(value)) {
                errors.push(`${label} must be an array`);
            }

            if (rule.enum && !rule.enum.includes(value)) {
                errors.push(`${label} must be one of: ${rule.enum.join(', ')}`);
            }
        }

        if (errors.length > 0) {
            return sendError(res, 'Validation failed', 400, errors);
        }

        return next();
    };
}

function validateCoordinates(latitude, longitude) {
    const parsedLatitude = Number(latitude);
    const parsedLongitude = Number(longitude);

    return (
        Number.isFinite(parsedLatitude) &&
        Number.isFinite(parsedLongitude) &&
        parsedLatitude >= -90 &&
        parsedLatitude <= 90 &&
        parsedLongitude >= -180 &&
        parsedLongitude <= 180
    );
}

module.exports = {
    requireFields,
    toNumber,
    validateBody,
    validateCoordinates
};
