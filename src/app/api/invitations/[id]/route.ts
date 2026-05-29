import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

// DELETE /api/invitations/[id] — Revoke an invitation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireOrgAdmin(auth) || !auth.organizationId) {
      return NextResponse.json(
        { error: 'Unauthorized. Admin access required.', code: 'UNAUTHORIZED' },
        { status: 401 }
      );
    }

    const { id } = await params;

    // ── Find the invitation ──
    const invitation = await db.invitation.findUnique({
      where: { id },
    });

    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found.', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    // ── Ensure invitation belongs to the current org ──
    if (invitation.organizationId !== auth.organizationId) {
      return NextResponse.json(
        { error: 'You do not have permission to revoke this invitation.', code: 'FORBIDDEN' },
        { status: 403 }
      );
    }

    // ── Check invitation is still pending ──
    if (invitation.status !== 'PENDING') {
      return NextResponse.json(
        { error: `Cannot revoke an invitation with status "${invitation.status}".`, code: 'NOT_PENDING' },
        { status: 400 }
      );
    }

    // ── Mark as revoked ──
    await db.invitation.update({
      where: { id },
      data: { status: 'REVOKED' },
    });

    return NextResponse.json({ success: true, message: 'Invitation revoked successfully.' });
  } catch (error) {
    console.error('Revoke invitation error:', error);
    return NextResponse.json(
      { error: 'Something went wrong.', code: 'SERVER_ERROR' },
      { status: 500 }
    );
  }
}
