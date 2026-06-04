import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createHmac, timingSafeEqual } from 'crypto';

// Generate a TOKEN_SECRET at module load time
const TOKEN_SECRET = process.env.TOKEN_SECRET;

// Startup validation — log a CRITICAL warning if TOKEN_SECRET is missing
if (!TOKEN_SECRET) {
  console.error('');
  console.error('╔══════════════════════════════════════════════════════════════╗');
  console.error('║  CRITICAL: TOKEN_SECRET environment variable is not set!    ║');
  console.error('║  All JWT tokens will fail. Set TOKEN_SECRET in your .env.    ║');
  console.error('╚══════════════════════════════════════════════════════════════╝');
  console.error('');
}

/**
 * Create a signed token for a user.
 * Token format: base64(userId:timestamp:signature)
 * Signature = HMAC-SHA256(userId:timestamp, TOKEN_SECRET)
 */
export function createToken(userId: string): string {
  const timestamp = Date.now().toString();
  const payload = `${userId}:${timestamp}`;
  const signature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64');
}

// ── Types ──────────────────────────────────────────────────────────────────

export interface AuthContext {
  userId: string;
  role: string;
  organizationId: string | null;
  organization: {
    id: string;
    name: string;
    slug: string;
    isActive: boolean;
    subscriptionStatus: string;
    maxUsers: number;
    maxNumbers: number;
    dailyUploadLimit: number;
  } | null;
}

/**
 * Authenticate a request by checking the Authorization header token.
 * Token format: base64(userId:timestamp:signature)
 * Returns full AuthContext including organization info, or null if invalid.
 */
export async function authenticateRequest(request: NextRequest): Promise<AuthContext | null> {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return null;
    }

    const token = authHeader.slice(7); // Remove "Bearer "
    const decoded = Buffer.from(token, 'base64').toString('utf-8');
    const parts = decoded.split(':');

    if (parts.length !== 3) {
      return null;
    }

    const [userId, timestamp, signature] = parts;

    if (!userId || !timestamp || !signature) {
      return null;
    }

    // Verify HMAC signature using timing-safe comparison
    const payload = `${userId}:${timestamp}`;
    if (!TOKEN_SECRET) return null;
    const expectedSignature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    try {
      const isValid = timingSafeEqual(
        Buffer.from(signature),
        Buffer.from(expectedSignature)
      );
      if (!isValid) return null;
    } catch {
      return null;
    }

    // Check token age (max 7 days = 604800 seconds)
    const tokenAge = (Date.now() - parseInt(timestamp, 10)) / 1000;
    if (tokenAge > 604800) {
      return null;
    }

    // Verify user exists and is active, and include organization data
    const user = await db.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        role: true,
        isActive: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            isActive: true,
            subscriptionStatus: true,
            maxUsers: true,
            maxNumbers: true,
            dailyUploadLimit: true,
          },
        },
      },
    });

    if (!user || !user.isActive) {
      return null;
    }

    // Normalize legacy ADMIN role to ORG_ADMIN for backward compatibility
    let normalizedRole = user.role;
    if (normalizedRole === 'ADMIN') normalizedRole = 'ORG_ADMIN';

    // SUPER_ADMIN users may not have an organizationId — that's allowed
    return {
      userId: user.id,
      role: normalizedRole,
      organizationId: user.organizationId,
      organization: user.organization
        ? {
            id: user.organization.id,
            name: user.organization.name,
            slug: user.organization.slug,
            isActive: user.organization.isActive,
            subscriptionStatus: user.organization.subscriptionStatus,
            maxUsers: user.organization.maxUsers,
            maxNumbers: user.organization.maxNumbers,
            dailyUploadLimit: user.organization.dailyUploadLimit,
          }
        : null,
    };
  } catch (error) {
    console.error('[Auth] Token verification error:', error);
    return null;
  }
}

// ── Helper functions ──────────────────────────────────────────────────────

/**
 * Check if the authenticated user has SUPER_ADMIN role.
 */
export function requireSuperAdmin(auth: AuthContext): boolean {
  return auth.role === 'SUPER_ADMIN';
}

/**
 * Check if the authenticated user is a SUPER_ADMIN or ORG_ADMIN.
 */
export function requireOrgAdmin(auth: AuthContext): boolean {
  return auth.role === 'SUPER_ADMIN' || auth.role === 'ORG_ADMIN';
}

/**
 * @deprecated Use requireSuperAdmin(auth) or requireOrgAdmin(auth) instead.
 */
export function requireAdmin(role: string): boolean {
  return role === 'ADMIN' || role === 'SUPER_ADMIN' || role === 'ORG_ADMIN';
}
