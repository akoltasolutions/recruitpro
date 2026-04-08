import { NextRequest, NextResponse } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

const APK_FILE_NAME = 'recruitpro.apk';
const UPLOAD_DIR = path.join(process.cwd(), 'upload');

export async function GET(request: NextRequest) {
  try {
    const filePath = path.join(UPLOAD_DIR, APK_FILE_NAME);

    // Check if APK file exists
    try {
      await fs.access(filePath);
    } catch {
      // APK not uploaded yet — return a friendly message page
      const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>RecruitPro — Android App</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f1f5f9; display: flex; align-items: center; justify-content: center; min-height: 100vh; padding: 20px; }
    .card { background: white; border-radius: 16px; padding: 40px 32px; max-width: 400px; width: 100%; text-align: center; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
    .icon { width: 72px; height: 72px; background: #059669; border-radius: 16px; display: flex; align-items: center; justify-content: center; margin: 0 auto 20px; }
    .icon svg { width: 36px; height: 36px; fill: white; }
    h1 { font-size: 22px; font-weight: 700; color: #0f172a; margin-bottom: 8px; }
    p { font-size: 14px; color: #64748b; line-height: 1.6; margin-bottom: 20px; }
    .badge { display: inline-block; background: #fef3c7; color: #92400e; font-size: 12px; font-weight: 600; padding: 4px 12px; border-radius: 20px; }
    a.back { display: inline-block; margin-top: 20px; color: #059669; text-decoration: none; font-weight: 600; font-size: 14px; }
    a.back:hover { text-decoration: underline; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">
      <svg viewBox="0 0 24 24"><path d="M17.523 2.577a.75.75 0 00-.955-.46l-4 1.5a.75.75 0 00.528 1.404l4-1.5a.75.75 0 00.427-.944zm-11.046 0a.75.75 0 01.955-.46l4 1.5a.75.75 0 01-.528 1.404l-4-1.5a.75.75 0 01-.427-.944zM12 6a8 8 0 018 8c0 1.5-.4 2.9-1.1 4.1l1.4 1.4a.75.75 0 01-1.06 1.06l-1.3-1.3A7.96 7.96 0 0112 21a7.96 7.96 0 01-5.94-2.74l-1.3 1.3a.75.75 0 01-1.06-1.06l1.4-1.4A7.97 7.97 0 014 14a8 8 0 018-8zm0 2a3 3 0 00-3 3v2a3 3 0 006 0v-2a3 3 0 00-3-3zm-1.5 3a1.5 1.5 0 013 0v2a1.5 1.5 0 01-3 0v-2z"/></svg>
    </div>
    <h1>Android App Coming Soon</h1>
    <p>The RecruitPro Android app is being prepared. Please check back later or contact your administrator for the APK file.</p>
    <span class="badge">APK Not Uploaded Yet</span>
    <br>
    <a href="/" class="back">← Back to Login</a>
  </div>
</body>
</html>`;
      return new NextResponse(html, {
        status: 200,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    // Read the APK file
    const fileBuffer = await fs.readFile(filePath);
    const stats = await fs.stat(filePath);

    return new NextResponse(fileBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.android.package-archive',
        'Content-Disposition': `attachment; filename="RecruitPro.apk"`,
        'Content-Length': stats.size.toString(),
        'Cache-Control': 'public, max-age=86400',
      },
    });
  } catch (error) {
    console.error('APK download error:', error);
    return NextResponse.json(
      { error: 'Download failed. Please try again later.' },
      { status: 500 }
    );
  }
}
