import { db } from '@/lib/db'

export type SecurityAction =
  | 'LOGIN_SUCCESS' | 'LOGIN_FAILURE' | 'LOGIN_LOCKED' | 'LOGOUT'
  | 'PASSWORD_CHANGE' | 'PASSWORD_RESET' | 'PASSWORD_RESET_REQUEST'
  | 'MFA_ENABLED' | 'MFA_DISABLED' | 'MFA_VERIFIED' | 'MFA_FAILED'
  | 'USER_CREATED' | 'USER_UPDATED' | 'USER_DELETED' | 'ROLE_CHANGED' | 'STATUS_CHANGED'
  | 'ORG_CREATED' | 'ORG_UPDATED' | 'ORG_SUSPENDED'
  | 'EXPORT_DATA' | 'IMPORT_DATA' | 'BACKUP_CREATED' | 'BACKUP_RESTORED'
  | 'SETTINGS_CHANGED' | 'SESSION_REVOKED' | 'ALL_SESSIONS_REVOKED'

export interface AuditLogOptions {
  userId?: string
  organizationId?: string
  action: SecurityAction
  resourceType?: string
  resourceId?: string
  details?: Record<string, unknown>
  ipAddress?: string
  userAgent?: string
  status?: 'SUCCESS' | 'FAILURE' | 'BLOCKED'
}

/**
 * Log a security audit event to the database.
 * Runs asynchronously without blocking the caller.
 */
export async function logSecurityEvent(options: AuditLogOptions): Promise<void> {
  try {
    await db.securityAuditLog.create({
      data: {
        userId: options.userId,
        organizationId: options.organizationId,
        action: options.action,
        resourceType: options.resourceType || null,
        resourceId: options.resourceId || null,
        details: options.details ? JSON.stringify(options.details) : null,
        ipAddress: options.ipAddress || null,
        userAgent: options.userAgent || null,
        status: options.status || 'SUCCESS',
      },
    })
  } catch (error) {
    // Never block the caller for audit logging failures
    console.error('[SecurityAudit] Failed to log event:', error)
  }
}

/**
 * Extract client IP from request headers
 */
export function getClientIp(request: Request): string {
  const headers = new Headers(request.headers)
  return (
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown'
  )
}

/**
 * Extract user agent from request headers
 */
export function getUserAgent(request: Request): string {
  return new Headers(request.headers).get('user-agent') || 'unknown'
}
