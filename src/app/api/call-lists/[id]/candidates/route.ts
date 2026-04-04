import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(_request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const candidates = await db.candidate.findMany({
      where: { callListId: id },
      include: { callRecords: { orderBy: { calledAt: 'desc' }, take: 1 } },
      orderBy: { createdAt: 'asc' },
    });
    return NextResponse.json({ candidates });
  } catch (error) {
    console.error('Get candidates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const { id } = await params;
    const candidates = await request.json();

    const created = await db.candidate.createMany({
      data: candidates.map((c: Record<string, unknown>) => ({
        callListId: id,
        name: String(c.name || ''),
        phone: String(c.phone || ''),
        email: c.email ? String(c.email) : null,
        role: c.role ? String(c.role) : null,
        location: c.location ? String(c.location) : null,
        company: c.company ? String(c.company) : null,
      })),
    });

    return NextResponse.json({ count: created.count }, { status: 201 });
  } catch (error) {
    console.error('Add candidates error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
