/**
 * Bridge module for Backward Compatibility
 * Re-exports adminRouter and helper functions from routes, services, and models
 */
import { AuditLogModel } from './models/auditLog.model.js';

export { adminRouter } from './routes/admin.routes.js';
export { applyAnimeOverride } from './services/kkphim.service.js';

export async function createAuditLog({ req, action, targetType, targetId, details }) {
  return AuditLogModel.recordLog({
    userId: req?.user?.id || 'system',
    adminName: req?.user?.name || 'Admin',
    adminEmail: req?.user?.email || null,
    action,
    targetType,
    targetId,
    details,
    ipAddress: req?.ip || req?.headers?.['x-forwarded-for'] || null
  });
}
