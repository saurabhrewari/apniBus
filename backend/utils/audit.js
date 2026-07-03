const AuditLog = require('../models/AuditLog');

async function recordAudit({
    req,
    actorId,
    actorRole,
    action,
    entityType,
    entityId,
    entityLabel,
    metadata = {}
}) {
    try {
        await AuditLog.create({
            actorId: actorId || req?.user?.id || req?.user?.driverId || 'system',
            actorRole: actorRole || req?.user?.role || 'system',
            action,
            entityType,
            entityId: entityId ? String(entityId) : undefined,
            entityLabel,
            metadata,
            requestId: req?.requestId,
            ipAddress: req?.ip
        });
    } catch (error) {
        console.error('Audit log write failed:', error.message);
    }
}

module.exports = {
    recordAudit
};
