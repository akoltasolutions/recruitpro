import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const dispositions = await db.disposition.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ dispositions });
  } catch (error) {
    console.error('Dispositions list error:', error);
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
    const { heading, type } = await request.json();
    if (!heading || !type) return NextResponse.json({ error: 'Heading and type are required' }, { status: 400 });

    const validTypes = ['SHORTLISTED', 'CONNECTED', 'NOT_CONNECTED', 'NOT_INTERESTED'];
    if (!validTypes.includes(type)) return NextResponse.json({ error: 'Invalid disposition type' }, { status: 400 });

    const disposition = await db.disposition.create({ data: { heading, type } });
    return NextResponse.json({ disposition }, { status: 201 });
  } catch (error) {
    console.error('Create disposition error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
