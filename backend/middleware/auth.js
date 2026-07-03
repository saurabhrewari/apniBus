const { sendError } = require('../utils/apiResponse');
const { verifyToken } = require('../utils/token');

function isStrictAuthEnabled() {
    return String(process.env.REQUIRE_AUTH || '').toLowerCase() === 'true';
}

function optionalAuth(req, _res, next) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
    req.user = verifyToken(token);
    next();
}

function requireAuth(roles = []) {
    return (req, res, next) => {
        optionalAuth(req, res, () => {
            if (!isStrictAuthEnabled()) {
                return next();
            }

            if (!req.user) {
                return sendError(res, 'Authentication required', 401);
            }

            if (roles.length > 0 && !roles.includes(req.user.role)) {
                return sendError(res, 'You do not have permission for this action', 403);
            }

            return next();
        });
    };
}

module.exports = {
    optionalAuth,
    requireAuth
};
