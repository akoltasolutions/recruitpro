import { NextRequest, NextResponse } from 'next/server';
import { createHmac, timingSafeEqual } from 'crypto';
import { spawn } from 'child_process';

export async function POST(request: NextRequest) {
  try {
    const githubEvent = request.headers.get('x-github-event');

    // Only respond to push events
    if (githubEvent && githubEvent !== 'push') {
      return NextResponse.json({ message: 'Ignored: not a push event' }, { status: 200 });
    }

    // ── Verify GitHub webhook signature ──
    const githubSecret = process.env.GITHUB_WEBHOOK_SECRET;
    if (!githubSecret) {
      console.error('[Deploy Webhook] GITHUB_WEBHOOK_SECRET not set');
      return NextResponse.json({ error: 'Webhook not configured' }, { status: 503 });
    }

    const signature = request.headers.get('x-hub-signature-256');
    if (!signature) {
      return NextResponse.json({ error: 'Missing signature' }, { status: 401 });
    }

    const rawBody = await request.text();
    const expectedSig = 'sha256=' + createHmac('sha256', githubSecret).update(rawBody).digest('hex');

    try {
      const isValid = timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSig));
      if (!isValid) {
        return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
      }
    } catch {
      return NextResponse.json({ error: 'Invalid signature' }, { status: 401 });
    }

    // Parse body from rawBody instead of request.json()
    let body: Record<string, unknown>;
    try {
      body = JSON.parse(rawBody);
    } catch {
      body = {};
    }

    const ref = (body.ref as string) || '';
    const repository = (body.repository as Record<string, unknown>) || {};
    const repoName = (repository.full_name as string) || 'unknown';
    const pusher = (body.pusher as Record<string, unknown>) || {};
    const pusherName = (pusher.name as string) || 'unknown';

    console.log(`[Deploy Webhook] Push received: ${ref} from ${repoName} by ${pusherName}`);

    // Only deploy from main branch
    if (!ref.includes('refs/heads/main')) {
      console.log(`[Deploy Webhook] Ignored: not main branch (${ref})`);
      return NextResponse.json({ message: 'Ignored: not main branch' });
    }

    // Run deploy.sh detached in background so the webhook can respond
    // before PM2 deletes the running process
    const deployLog = '/home/ubuntu/recruitpro/logs/deploy-webhook.log';

    const child = spawn(
      'bash',
      ['-c', `nohup bash /home/ubuntu/recruitpro/deploy.sh > ${deployLog} 2>&1 & echo $!`],
      {
        detached: true,
        stdio: 'ignore',
        shell: true,
        env: { ...process.env },
      }
    );

    child.unref();

    return NextResponse.json({
      success: true,
      message: 'Deployment started in background',
      log: deployLog,
    });
  } catch (error) {
    console.error('[Deploy Webhook] Unexpected error:', error);
    return NextResponse.json(
      { success: false, message: 'Internal server error' },
      { status: 500 }
    );
  }
}

// GET for health check
export async function GET() {
  return NextResponse.json({ status: 'ok', message: 'Deploy webhook is active' });
}
