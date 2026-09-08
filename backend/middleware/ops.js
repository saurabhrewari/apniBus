function requestLogger(req, res, next) {
    req.requestId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
    res.setHeader('X-Request-Id', req.requestId);

    const startedAt = Date.now();
    res.on('finish', () => {
        const durationMs = Date.now() - startedAt;
        console.log(`${req.method} ${req.originalUrl} ${res.statusCode} ${durationMs}ms ${req.requestId}`);
    });

    next();
}

function securityHeaders(_req, res, next) {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(self), camera=(), microphone=()');
    if (process.env.NODE_ENV === 'production') {
        res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
}

function createRateLimiter({
    windowMs = 1000 * 60,
    maxRequests = 180,
    keyPrefix = 'api'
} = {}) {
    const buckets = new Map();

    return (req, res, next) => {
        if (String(process.env.RATE_LIMIT_ENABLED || 'true').toLowerCase() === 'false') {
            return next();
        }

        const now = Date.now();
        const key = `${keyPrefix}:${req.ip}`;
        const bucket = buckets.get(key) || { count: 0, resetAt: now + windowMs };

        if (bucket.resetAt <= now) {
            bucket.count = 0;
            bucket.resetAt = now + windowMs;
        }

        bucket.count += 1;
        buckets.set(key, bucket);

        res.setHeader('X-RateLimit-Limit', String(maxRequests));
        res.setHeader('X-RateLimit-Remaining', String(Math.max(maxRequests - bucket.count, 0)));
        res.setHeader('X-RateLimit-Reset', String(Math.ceil(bucket.resetAt / 1000)));

        if (bucket.count > maxRequests) {
            return res.status(429).json({
                success: false,
                msg: 'Too many requests. Please wait and try again.',
                message: 'Too many requests. Please wait and try again.'
            });
        }

        if (buckets.size > 5000) {
            for (const [bucketKey, value] of buckets.entries()) {
                if (value.resetAt <= now) {
                    buckets.delete(bucketKey);
                }
            }
        }

        return next();
    };
}

function notFoundHandler(req, res) {
    res.status(404).json({
        success: false,
        msg: `Route not found: ${req.method} ${req.originalUrl}`
    });
}

function errorHandler(err, req, res, _next) {
    console.error(`Unhandled error ${req.requestId || ''}:`, err);
    res.status(err.statusCode || 500).json({
        success: false,
        msg: err.message || 'Server Error',
        requestId: req.requestId
    });
}

module.exports = {
    createRateLimiter,
    errorHandler,
    notFoundHandler,
    requestLogger,
    securityHeaders
};
