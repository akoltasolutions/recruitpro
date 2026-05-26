import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { createHmac } from 'crypto';

// Generate a TOKEN_SECRET at module load time
// Use a stable fallback secret to avoid module instance issues in dev mode (Turbopack)
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'recruitpro-hmac-secret-key-2024-stable-v1';

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

/**
 * Authenticate a request by checking the Authorization header token.
 * Token format: base64(userId:timestamp:signature)
 * Returns { userId, role } or null if invalid.
 */
export async function authenticateRequest(request: NextRequest): Promise<{ userId: string; role: string } | null> {
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

    // Verify HMAC signature
    const payload = `${userId}:${timestamp}`;
    const expectedSignature = createHmac('sha256', TOKEN_SECRET).update(payload).digest('hex');
    if (signature !== expectedSignature) {
      return null;
    }

    // Check token age (max 7 days = 604800 seconds)
    const tokenAge = (Date.now() - parseInt(timestamp, 10)) / 1000;
    if (tokenAge > 604800) {
      return null;
    }

    // Verify user exists and is active
    const user = await db.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, isActive: true },
    });

    if (!user || !user.isActive) {
      return null;
    }

    return { userId: user.id, role: user.role };
  } catch {
    return null;
  }
}

/**
 * Require admin role. Returns error response if not admin.
 */
export function requireAdmin(role: string): boolean {
  return role === 'ADMIN';
}
