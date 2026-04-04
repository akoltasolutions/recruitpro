import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireAdmin } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const clients = await db.client.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ clients });
  } catch (error) {
    console.error('Clients list error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    if (auth.role !== 'ADMIN') {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { name } = await request.json();
    if (!name) return NextResponse.json({ error: 'Client name is required' }, { status: 400 });

    const existing = await db.client.findUnique({ where: { name } });
    if (existing) return NextResponse.json({ error: 'Client already exists' }, { status: 409 });

    const client = await db.client.create({ data: { name } });
    return NextResponse.json({ client }, { status: 201 });
  } catch (error) {
    console.error('Create client error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
