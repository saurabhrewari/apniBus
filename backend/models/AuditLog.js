const mongoose = require('mongoose');

const AuditLogSchema = new mongoose.Schema(
    {
        actorId: {
            type: String,
            trim: true,
            index: true
        },
        actorRole: {
            type: String,
            trim: true,
            index: true
        },
        action: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        entityType: {
            type: String,
            required: true,
            trim: true,
            index: true
        },
        entityId: {
            type: String,
            trim: true,
            index: true
        },
        entityLabel: {
            type: String,
            trim: true
        },
        metadata: {
            type: mongoose.Schema.Types.Mixed,
            default: {}
        },
        requestId: {
            type: String,
            trim: true
        },
        ipAddress: {
            type: String,
            trim: true
        }
    },
    { timestamps: true }
);

AuditLogSchema.index({ createdAt: -1 });
AuditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });

module.exports = mongoose.model('AuditLog', AuditLogSchema);
