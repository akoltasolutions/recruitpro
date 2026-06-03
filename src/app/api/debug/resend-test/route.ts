import { NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

/**
 * Diagnostic endpoint to test Resend email connectivity from production.
 * Call: GET /api/debug/resend-test
 *
 * Returns:
 * 1. Git commit hash (confirms latest code is deployed)
 * 2. RESEND_API_KEY presence (masked)
 * 3. resend package availability
 * 4. Actual Resend API test (sends test email)
 *
 * SAFE to call on production — does not expose secrets.
 */
export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
  };

  // ── 1. Git commit hash ──
  try {
    const commitHash = execSync('git rev-parse --short HEAD', {
      encoding: 'utf-8',
      timeout: 5000,
      cwd: process.cwd(),
    }).trim();
    diagnostics.gitCommit = commitHash;
  } catch {
    diagnostics.gitCommit = 'unknown';
  }

  // ── 2. RESEND_API_KEY check ──
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey) {
    diagnostics.resendApiKey = {
      set: true,
      length: apiKey.length,
      startsWith: apiKey.substring(0, 4) + '...',
      validFormat: apiKey.startsWith('re_'),
    };
  } else {
    diagnostics.resendApiKey = { set: false };
  }

  // ── 3. EMAIL_FROM ──
  diagnostics.emailFrom = process.env.EMAIL_FROM || '(not set — default: RecruitPro <noreply@akolta.com>)';

  // ── 4. Check .env file for RESEND_API_KEY line ──
  try {
    const envPath = join(process.cwd(), '.env');
    if (existsSync(envPath)) {
      const envContent = readFileSync(envPath, 'utf-8');
      const hasKey = envContent.includes('RESEND_API_KEY=');
      const keyLine = envContent.split('\n').find(l => l.startsWith('RESEND_API_KEY='));
      diagnostics.envFile = {
        exists: true,
        hasResendKeyLine: hasKey,
        keyLinePreview: keyLine
          ? keyLine.substring(0, 20) + (keyLine.length > 20 ? '...' : '')
          : '(no line found)',
        isEmpty: keyLine === 'RESEND_API_KEY=""' || keyLine === 'RESEND_API_KEY=',
      };
    } else {
      diagnostics.envFile = { exists: false };
    }
  } catch (e) {
    diagnostics.envFile = { error: String(e) };
  }

  // ── 5. Check if resend package can be loaded ──
  try {
    const { Resend } = await import('resend');
    diagnostics.resendPackage = { loaded: true, type: typeof Resend };

    if (!apiKey) {
      return NextResponse.json({
        status: 'error',
        diagnostics,
        error: 'RESEND_API_KEY is not set in the environment. Add it to the .env file and restart the server.',
      });
    }

    // ── 6. Test actual Resend API call ──
    const resend = new Resend(apiKey);
    const fromAddress = process.env.EMAIL_FROM || 'RecruitPro <noreply@akolta.com>';

    console.log('[ResendTest] Attempting to send test email from:', fromAddress, 'to:', fromAddress);

    const { data, error: resendError } = await resend.emails.send({
      from: fromAddress,
      to: fromAddress,
      subject: 'RecruitPro — Resend Connectivity Test',
      html: `
        <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px">
          <h1 style="color:#059669;margin:0 0 16px">✅ Resend Test Successful</h1>
          <p style="color:#6b7280;margin:0 0 8px">
            If you received this email, Resend is working correctly on the production server.
          </p>
          <p style="color:#9ca3af;font-size:13px">
            Sent at: ${new Date().toISOString()}<br/>
            Git commit: ${diagnostics.gitCommit}
          </p>
        </div>
      `,
    });

    if (resendError) {
      console.error('[ResendTest] Resend API returned error:', JSON.stringify(resendError));
      diagnostics.resendResponse = { error: resendError };
      return NextResponse.json({
        status: 'error',
        diagnostics,
        error: `Resend API error: ${resendError.name} — ${resendError.message} (statusCode: ${resendError.statusCode})`,
      });
    }

    console.log('[ResendTest] Test email sent successfully! Resend ID:', data?.id);
    diagnostics.resendResponse = { success: true, emailId: data?.id };

    return NextResponse.json({
      status: 'success',
      diagnostics,
      message: 'Test email sent successfully! Check inbox of ' + fromAddress,
    });
  } catch (error) {
    console.error('[ResendTest] Failed:', error);
    diagnostics.resendPackage = { loaded: false, error: String(error) };
    return NextResponse.json({
      status: 'error',
      diagnostics,
      error: `Failed to load resend package: ${String(error)}. Run "bun install" to install it.`,
    });
  }
}
