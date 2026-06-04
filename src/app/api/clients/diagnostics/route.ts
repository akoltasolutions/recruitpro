import { NextResponse } from 'next/server';
import { authenticateRequest, requireOrgAdmin } from '@/lib/auth-middleware';

export async function GET(request: Request) {
  const auth = await authenticateRequest(request as any);
  if (!auth || !requireOrgAdmin(auth)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  return NextResponse.json({
    status: 'ok',
    message: 'Diagnostics endpoint deprecated. Use backup/restore for data operations.'
  });
}
