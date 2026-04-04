import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(_request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Non-admin users can only view their own profile
    if (auth.role !== 'ADMIN' && auth.userId !== id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const user = await db.user.findUnique({
      where: { id },
      select: {
        id: true, email: true, name: true, phone: true, role: true,
        isActive: true, avatarUrl: true, callModeOn: true,
        whatsappAccess: true, uploadPermission: true, createListPermission: true, createdAt: true,
      },
    });
    if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 });
    return NextResponse.json({ user });
  } catch (error) {
    console.error('Get user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    // Non-admin users can only update their own profile
    if (auth.role !== 'ADMIN' && auth.userId !== id) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const data = await request.json();

    // Whitelist safe fields for non-admin users
    const allowedFields = ['name', 'email', 'phone', 'password'];
    for (const key of Object.keys(data)) {
      if (!allowedFields.includes(key) && auth.role !== 'ADMIN') {
        delete data[key];
      }
    }

    const existing = await db.user.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: 'User not found' }, { status: 404 });

    const updateData: Record<string, unknown> = {};
    if (data.name !== undefined) updateData.name = data.name;
    if (data.email !== undefined) updateData.email = data.email;
    if (data.phone !== undefined) updateData.phone = data.phone;
    if (data.isActive !== undefined) updateData.isActive = data.isActive;
    if (data.callModeOn !== undefined) updateData.callModeOn = data.callModeOn;
    if (data.whatsappAccess !== undefined) updateData.whatsappAccess = data.whatsappAccess;
    if (data.uploadPermission !== undefined) updateData.uploadPermission = data.uploadPermission;
    if (data.createListPermission !== undefined) updateData.createListPermission = data.createListPermission;
    if (data.password) updateData.password = await hashPassword(data.password);

    const user = await db.user.update({ where: { id }, data: updateData });
    const { password: _, ...safeUser } = user;
    return NextResponse.json({ user: safeUser });
  } catch (error) {
    console.error('Update user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const auth = await authenticateRequest(_request);
    if (!auth) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    await db.user.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Delete user error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
