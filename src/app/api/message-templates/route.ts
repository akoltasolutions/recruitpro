import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    const templates = await db.messageTemplate.findMany({
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json({ templates });
  } catch (error) {
    console.error('Message templates error:', error);
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
    const { name, type, content } = await request.json();
    if (!name || !type || !content) {
      return NextResponse.json({ error: 'Name, type, and content are required' }, { status: 400 });
    }

    // Validate template type
    const validTypes = ['NOT_ANSWERED', 'SHORTLISTED', 'CUSTOM'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ error: 'Invalid template type' }, { status: 400 });
    }

    const template = await db.messageTemplate.create({ data: { name, type, content } });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Create message template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
