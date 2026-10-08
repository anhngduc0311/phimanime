/**
 * Bridge module for Backward Compatibility
 * Re-exports auth functions from services and middlewares
 */
export {
  getAdminEmails,
  isEmailAdmin,
  hashPassword,
  verifyPassword,
  verifyGoogleCredential,
  verifyGoogleAccessToken,
  upsertUser,
  authenticateLocalUser,
  registerLocalUser,
  createSession,
  getUserByToken,
  revokeSession,
  getUserSessions,
  revokeOtherSessions,
  updateUserProfile
} from './services/auth.service.js';

export {
  extractBearerToken,
  requireAuth,
  optionalAuth,
  requireAdmin
} from './middlewares/auth.middleware.js';
