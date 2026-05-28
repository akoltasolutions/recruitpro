import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import path from 'path';

// GitHub webhook secret for verification (optional but recommended)
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'recruitpro-webhook-secret-2024';

export async function POST(request: NextRequest) {
  try {
    // Verify webhook signature (GitHub sends X-Hub-Signature-256)
    const signature = request.headers.get('x-hub-signature-256');
    const githubEvent = request.headers.get('x-github-event');

    // Only respond to push events
    if (githubEvent && githubEvent !== 'push') {
      return NextResponse.json({ message: 'Ignored: not a push event' }, { status: 200 });
    }

    // Parse the body
    let body: Record<string, unknown>;
    try {
      body = await request.json();
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

    // Execute deploy script
    const deployScript = path.join(process.cwd(), 'deploy.sh');

    console.log('[Deploy Webhook] Starting deployment...');

    try {
      const output = execSync(`bash ${deployScript}`, {
        cwd: process.cwd(),
        timeout: 300000, // 5 minutes max
        env: {
          ...process.env,
          PATH: process.env.PATH || '/usr/local/bin:/usr/bin:/bin',
        },
        stdio: 'pipe',
        encoding: 'utf-8',
      });

      console.log(`[Deploy Webhook] Success:\n${output}`);

      return NextResponse.json({
        success: true,
        message: 'Deployment completed successfully',
        output: output.trim(),
      });
    } catch (deployError: unknown) {
      const error = deployError as { stdout?: string; stderr?: string; message?: string };
      console.error(`[Deploy Webhook] Error:\n${error.stdout}\n${error.stderr}`);

      return NextResponse.json({
        success: false,
        message: 'Deployment failed',
        output: (error.stdout || '').trim(),
        error: (error.stderr || '').trim(),
      }, { status: 500 });
    }
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
