import { NextResponse } from 'next/server';

/**
 * Diagnostic endpoint to test Resend email connectivity from production.
 * Call: GET /api/debug/resend-test
 * Returns detailed info about Resend configuration and sends a test email.
 */
export async function GET() {
  const diagnostics: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    nodeEnv: process.env.NODE_ENV,
  };

  // Check RESEND_API_KEY
  const apiKey = process.env.RESEND_API_KEY;
  diagnostics.resendApiKey = apiKey
    ? {
        set: true,
        length: apiKey.length,
        startsWith: apiKey.substring(0, 7) + '...',
        validFormat: apiKey.startsWith('re_'),
      }
    : { set: false };

  // Check EMAIL_FROM
  diagnostics.emailFrom = process.env.EMAIL_FROM || '(not set — will use default)';

  // Check if resend package is available
  try {
    const { Resend } = await import('resend');
    diagnostics.resendPackage = { loaded: true, type: typeof Resend };

    if (!apiKey) {
      return NextResponse.json({
        status: 'error',
        diagnostics,
        error: 'RESEND_API_KEY is not set in environment',
      });
    }

    // Try to send a test email
    const resend = new Resend(apiKey);
    const fromAddress = process.env.EMAIL_FROM || 'RecruitPro <noreply@akolta.com>';

    diagnostics.testEmail = { from: fromAddress, to: fromAddress };

    const { data, error: resendError } = await resend.emails.send({
      from: fromAddress,
      to: fromAddress,
      subject: 'RecruitPro — Resend Test Email',
      html: `
        <div style="max-width:480px;margin:0 auto;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;padding:32px">
          <h1 style="color:#059669;margin:0 0 16px">✅ Resend Test Successful</h1>
          <p style="color:#6b7280;margin:0 0 8px">
            If you received this email, Resend is working correctly on the production server.
          </p>
          <p style="color:#9ca3af;font-size:13px">
            Sent at: ${new Date().toISOString()}
          </p>
        </div>
      `,
    });

    if (resendError) {
      diagnostics.resendResponse = { error: resendError };
      return NextResponse.json({
        status: 'error',
        diagnostics,
        error: `Resend API error: ${resendError.name} — ${resendError.message}`,
      });
    }

    diagnostics.resendResponse = { success: true, emailId: data?.id };

    return NextResponse.json({
      status: 'success',
      diagnostics,
      message: 'Test email sent successfully! Check inbox of ' + fromAddress,
    });
  } catch (error) {
    diagnostics.resendPackage = { loaded: false, error: String(error) };
    return NextResponse.json({
      status: 'error',
      diagnostics,
      error: `Failed to load resend package: ${String(error)}`,
    });
  }
}
