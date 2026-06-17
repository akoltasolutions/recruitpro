import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

const VALID_TYPES = ['NOT_ANSWERED', 'SHORTLISTED', 'CUSTOM'] as const;
const VALID_CHANNELS = ['SMS', 'WHATSAPP', 'ALL'] as const;

export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

    const { searchParams } = new URL(request.url);
    const channel = searchParams.get('channel');

    const where: Record<string, unknown> = { organizationId: auth.organizationId };

    // Filter by channel: if channel is SMS or WHATSAPP, return templates for that
    // specific channel PLUS "ALL" templates (universal)
    if (channel && channel !== 'ALL') {
      where.channel = { in: [channel, 'ALL'] };
    }

    const templates = await db.messageTemplate.findMany({
      where,
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
    if (!requireOrgAdmin(auth)) {
      return NextResponse.json({ error: 'Access denied' }, { status: 403 });
    }
    const { name, type, content, channel } = await request.json();
    if (!name || !type || !content) {
      return NextResponse.json({ error: 'Name, type, and content are required' }, { status: 400 });
    }

    // Validate template type
    if (!VALID_TYPES.includes(type)) {
      return NextResponse.json({ error: 'Invalid template type. Must be NOT_ANSWERED, SHORTLISTED, or CUSTOM' }, { status: 400 });
    }

    // Validate channel (default to ALL if not provided)
    const validChannel = channel && VALID_CHANNELS.includes(channel) ? channel : 'ALL';

    const template = await db.messageTemplate.create({
      data: { name, type, content, channel: validChannel, organizationId: auth.organizationId },
    });
    return NextResponse.json({ template }, { status: 201 });
  } catch (error) {
    console.error('Create message template error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
