import { NextRequest, NextResponse } from 'next/server';
import { authenticateRequest, requireSuperAdmin } from '@/lib/auth-middleware';
import { db } from '@/lib/db';
import { promises as fs } from 'fs';
import path from 'path';

// ============================
// GET /api/backup — Download full backup
// ============================
export async function GET(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || 'full'; // 'full' | 'database' | 'users' | 'data'

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);

    if (type === 'database') {
      // Download just the SQLite database file
      const dbPath = path.join(process.cwd(), 'db', 'custom.db');
      try {
        await fs.access(dbPath);
      } catch {
        return NextResponse.json({ error: 'Database file not found' }, { status: 404 });
      }
      const dbBuffer = await fs.readFile(dbPath);
      return new NextResponse(dbBuffer, {
        headers: {
          'Content-Type': 'application/x-sqlite3',
          'Content-Disposition': `attachment; filename="recruitpro-database-${timestamp}.db"`,
          'Content-Length': dbBuffer.length.toString(),
        },
      });
    }

    // Full backup — JSON export of all data
    const backupData = await generateBackupData();

    if (type === 'users') {
      // Export only users (without passwords for security)
      const usersExport = backupData.users.map((u: Record<string, unknown>) => ({
        id: u.id,
        name: u.name,
        email: u.email,
        phone: u.phone || null,
        role: u.role,
        isActive: u.isActive,
        callModeOn: u.callModeOn,
        whatsappAccess: u.whatsappAccess,
        uploadPermission: u.uploadPermission,
        createListPermission: u.createListPermission,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      }));
      const json = JSON.stringify(usersExport, null, 2);
      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="recruitpro-users-${timestamp}.json"`,
        },
      });
    }

    if (type === 'data') {
      // Export everything except users
      const dataExport = {
        exportDate: new Date().toISOString(),
        version: '1.0',
        clients: backupData.clients,
        dispositions: backupData.dispositions,
        callLists: backupData.callLists,
        candidates: backupData.candidates,
        callRecords: backupData.callRecords,
        callListAssignments: backupData.callListAssignments,
        messageTemplates: backupData.messageTemplates,
        whatsAppMessages: backupData.whatsAppMessages,
        announcements: backupData.announcements,
        activityLogs: backupData.activityLogs,
      };
      const json = JSON.stringify(dataExport, null, 2);
      return new NextResponse(json, {
        headers: {
          'Content-Type': 'application/json',
          'Content-Disposition': `attachment; filename="recruitpro-data-${timestamp}.json"`,
        },
      });
    }

    // Full backup — everything
    const json = JSON.stringify(backupData, null, 2);
    return new NextResponse(json, {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="recruitpro-full-backup-${timestamp}.json"`,
      },
    });
  } catch (error) {
    console.error('Backup download error:', error);
    return NextResponse.json({ error: 'Failed to create backup' }, { status: 500 });
  }
}

// ============================
// POST /api/backup — Restore from uploaded backup
// ============================
export async function POST(request: NextRequest) {
  try {
    const auth = await authenticateRequest(request);
    if (!auth || !requireSuperAdmin(auth)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const contentType = request.headers.get('content-type') || '';

    if (contentType.includes('multipart/form-data')) {
      // File upload restore
      const formData = await request.formData();
      const file = formData.get('file') as File | null;

      if (!file) {
        return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
      }

      const fileBuffer = Buffer.from(await file.arrayBuffer());
      const fileName = file.name.toLowerCase();

      if (fileName.endsWith('.db')) {
        // Restore SQLite database directly
        const dbPath = path.join(process.cwd(), 'db', 'custom.db');
        await fs.writeFile(dbPath, fileBuffer);
        return NextResponse.json({
          success: true,
          message: 'Database restored successfully. Please restart the application.',
          type: 'database',
        });
      }

      if (fileName.endsWith('.json')) {
        // Restore from JSON backup
        const result = await restoreFromJSON(fileBuffer);
        return NextResponse.json(result);
      }

      return NextResponse.json({ error: 'Unsupported file format. Use .json or .db' }, { status: 400 });
    }

    // JSON body restore
    const body = await request.json();
    if (!body || typeof body !== 'object') {
      return NextResponse.json({ error: 'Invalid backup data' }, { status: 400 });
    }

    const result = await restoreFromJSON(Buffer.from(JSON.stringify(body)));
    return NextResponse.json(result);
  } catch (error) {
    console.error('Backup restore error:', error);
    return NextResponse.json({ error: 'Failed to restore backup: ' + (error as Error).message }, { status: 500 });
  }
}

// ============================
// Helper: Generate complete backup data
// ============================
async function generateBackupData() {
  const [
    users,
    clients,
    dispositions,
    callLists,
    candidates,
    callRecords,
    callListAssignments,
    messageTemplates,
    whatsAppMessages,
    announcements,
    activityLogs,
  ] = await Promise.all([
    db.user.findMany({ orderBy: { createdAt: 'asc' } }),
    db.client.findMany({ orderBy: { createdAt: 'asc' } }),
    db.disposition.findMany({ orderBy: { createdAt: 'asc' } }),
    db.callList.findMany({ orderBy: { createdAt: 'asc' } }),
    db.candidate.findMany({ orderBy: { createdAt: 'asc' } }),
    db.callRecord.findMany({ orderBy: { createdAt: 'asc' } }),
    db.callListAssignment.findMany(),
    db.messageTemplate.findMany({ orderBy: { createdAt: 'asc' } }),
    db.whatsAppMessage.findMany({ orderBy: { sentAt: 'asc' } }),
    db.announcement.findMany({ orderBy: { createdAt: 'asc' } }),
    db.activityLog.findMany({ orderBy: { createdAt: 'asc' } }),
  ]);

  return {
    exportDate: new Date().toISOString(),
    version: '1.0',
    app: 'RecruitPro',
    summary: {
      users: users.length,
      clients: clients.length,
      dispositions: dispositions.length,
      callLists: callLists.length,
      candidates: candidates.length,
      callRecords: callRecords.length,
      messageTemplates: messageTemplates.length,
      whatsAppMessages: whatsAppMessages.length,
      announcements: announcements.length,
      activityLogs: activityLogs.length,
    },
    users,
    clients,
    dispositions,
    callLists,
    candidates,
    callRecords,
    callListAssignments,
    messageTemplates,
    whatsAppMessages,
    announcements,
    activityLogs,
  };
}

// ============================
// Helper: Restore from JSON backup
// ============================
async function restoreFromJSON(buffer: Buffer) {
  const data = JSON.parse(buffer.toString('utf-8'));

  if (!data.version || !data.app) {
    return { success: false, error: 'Invalid backup file. Missing version or app identifier.' };
  }

  const stats: Record<string, number> = {};

  // Restore in correct order (respecting foreign keys)
  // 1. Users (no dependencies)
  if (data.users && Array.isArray(data.users)) {
    for (const user of data.users) {
      await db.user.upsert({
        where: { id: user.id },
        update: {
          name: user.name,
          email: user.email,
          phone: user.phone || null,
          role: user.role,
          isActive: user.isActive,
          avatarUrl: user.avatarUrl || null,
          callModeOn: user.callModeOn ?? true,
          whatsappAccess: user.whatsappAccess ?? true,
          uploadPermission: user.uploadPermission ?? false,
          createListPermission: user.createListPermission ?? false,
          ...(user.password ? { password: user.password } : {}),
        },
        create: {
          id: user.id,
          name: user.name,
          email: user.email,
          password: user.password || '$2b$10$placeholder',
          phone: user.phone || null,
          role: user.role,
          isActive: user.isActive,
          avatarUrl: user.avatarUrl || null,
          callModeOn: user.callModeOn ?? true,
          whatsappAccess: user.whatsappAccess ?? true,
          uploadPermission: user.uploadPermission ?? false,
          createListPermission: user.createListPermission ?? false,
        },
      });
    }
    stats.users = data.users.length;
  }

  // 2. Clients
  if (data.clients && Array.isArray(data.clients)) {
    for (const client of data.clients) {
      await db.client.upsert({
        where: { id: client.id },
        update: { name: client.name, isActive: client.isActive },
        create: { id: client.id, name: client.name, isActive: client.isActive },
      });
    }
    stats.clients = data.clients.length;
  }

  // 3. Dispositions
  if (data.dispositions && Array.isArray(data.dispositions)) {
    for (const disp of data.dispositions) {
      await db.disposition.upsert({
        where: { id: disp.id },
        update: { heading: disp.heading, type: disp.type, isActive: disp.isActive },
        create: { id: disp.id, heading: disp.heading, type: disp.type, isActive: disp.isActive },
      });
    }
    stats.dispositions = data.dispositions.length;
  }

  // 4. Call Lists
  if (data.callLists && Array.isArray(data.callLists)) {
    for (const list of data.callLists) {
      await db.callList.upsert({
        where: { id: list.id },
        update: {
          name: list.name,
          description: list.description,
          source: list.source,
          createdBy: list.createdBy,
          googleSheetsUrl: list.googleSheetsUrl,
          googleSheetGid: list.googleSheetGid,
          syncInterval: list.syncInterval,
          lastSyncedAt: list.lastSyncedAt ? new Date(list.lastSyncedAt) : null,
        },
        create: {
          id: list.id,
          name: list.name,
          description: list.description,
          source: list.source,
          createdBy: list.createdBy,
          googleSheetsUrl: list.googleSheetsUrl,
          googleSheetGid: list.googleSheetGid,
          syncInterval: list.syncInterval,
          lastSyncedAt: list.lastSyncedAt ? new Date(list.lastSyncedAt) : null,
        },
      });
    }
    stats.callLists = data.callLists.length;
  }

  // 5. Candidates
  if (data.candidates && Array.isArray(data.candidates)) {
    for (const cand of data.candidates) {
      await db.candidate.upsert({
        where: { id: cand.id },
        update: {
          callListId: cand.callListId,
          name: cand.name,
          phone: cand.phone,
          email: cand.email,
          role: cand.role,
          location: cand.location,
          company: cand.company,
          notes: cand.notes,
          status: cand.status,
          pipelineStage: cand.pipelineStage,
          followUpDate: cand.followUpDate ? new Date(cand.followUpDate) : null,
          interviewDate: cand.interviewDate ? new Date(cand.interviewDate) : null,
          joinedDate: cand.joinedDate ? new Date(cand.joinedDate) : null,
          backoutReason: cand.backoutReason,
        },
        create: {
          id: cand.id,
          callListId: cand.callListId,
          name: cand.name,
          phone: cand.phone,
          email: cand.email,
          role: cand.role,
          location: cand.location,
          company: cand.company,
          notes: cand.notes,
          status: cand.status,
          pipelineStage: cand.pipelineStage,
          followUpDate: cand.followUpDate ? new Date(cand.followUpDate) : null,
          interviewDate: cand.interviewDate ? new Date(cand.interviewDate) : null,
          joinedDate: cand.joinedDate ? new Date(cand.joinedDate) : null,
          backoutReason: cand.backoutReason,
        },
      });
    }
    stats.candidates = data.candidates.length;
  }

  // 6. Call List Assignments
  if (data.callListAssignments && Array.isArray(data.callListAssignments)) {
    for (const assign of data.callListAssignments) {
      await db.callListAssignment.upsert({
        where: { id: assign.id },
        update: {},
        create: { id: assign.id, callListId: assign.callListId, recruiterId: assign.recruiterId },
      });
    }
    stats.assignments = data.callListAssignments.length;
  }

  // 7. Call Records
  if (data.callRecords && Array.isArray(data.callRecords)) {
    for (const record of data.callRecords) {
      await db.callRecord.upsert({
        where: { id: record.id },
        update: {
          candidateId: record.candidateId,
          recruiterId: record.recruiterId,
          dispositionId: record.dispositionId,
          clientId: record.clientId,
          notes: record.notes,
          callDuration: record.callDuration,
          callStatus: record.callStatus,
          scheduledAt: record.scheduledAt ? new Date(record.scheduledAt) : null,
          f2fInterviewDate: record.f2fInterviewDate ? new Date(record.f2fInterviewDate) : null,
          customClientName: record.customClientName,
          calledAt: record.calledAt ? new Date(record.calledAt) : new Date(),
        },
        create: {
          id: record.id,
          candidateId: record.candidateId,
          recruiterId: record.recruiterId,
          dispositionId: record.dispositionId,
          clientId: record.clientId,
          notes: record.notes,
          callDuration: record.callDuration,
          callStatus: record.callStatus,
          scheduledAt: record.scheduledAt ? new Date(record.scheduledAt) : null,
          f2fInterviewDate: record.f2fInterviewDate ? new Date(record.f2fInterviewDate) : null,
          customClientName: record.customClientName,
          calledAt: record.calledAt ? new Date(record.calledAt) : new Date(),
        },
      });
    }
    stats.callRecords = data.callRecords.length;
  }

  // 8. Message Templates
  if (data.messageTemplates && Array.isArray(data.messageTemplates)) {
    for (const tmpl of data.messageTemplates) {
      await db.messageTemplate.upsert({
        where: { id: tmpl.id },
        update: { name: tmpl.name, type: tmpl.type, content: tmpl.content, isActive: tmpl.isActive, channel: tmpl.channel || 'ALL' },
        create: { id: tmpl.id, name: tmpl.name, type: tmpl.type, content: tmpl.content, isActive: tmpl.isActive, channel: tmpl.channel || 'ALL' },
      });
    }
    stats.messageTemplates = data.messageTemplates.length;
  }

  // 9. WhatsApp Messages
  if (data.whatsAppMessages && Array.isArray(data.whatsAppMessages)) {
    for (const msg of data.whatsAppMessages) {
      await db.whatsAppMessage.upsert({
        where: { id: msg.id },
        update: {},
        create: {
          id: msg.id,
          recruiterId: msg.recruiterId,
          candidateId: msg.candidateId,
          phone: msg.phone,
          message: msg.message,
          status: msg.status,
          sentAt: msg.sentAt ? new Date(msg.sentAt) : new Date(),
        },
      });
    }
    stats.whatsAppMessages = data.whatsAppMessages.length;
  }

  // 10. Announcements
  if (data.announcements && Array.isArray(data.announcements)) {
    for (const ann of data.announcements) {
      await db.announcement.upsert({
        where: { id: ann.id },
        update: { title: ann.title, content: ann.content, isActive: ann.isActive },
        create: { id: ann.id, title: ann.title, content: ann.content, isActive: ann.isActive, createdBy: ann.createdBy },
      });
    }
    stats.announcements = data.announcements.length;
  }

  // 11. Activity Logs
  if (data.activityLogs && Array.isArray(data.activityLogs)) {
    for (const log of data.activityLogs) {
      await db.activityLog.upsert({
        where: { id: log.id },
        update: {},
        create: {
          id: log.id,
          userId: log.userId,
          action: log.action,
          status: log.status,
          metadata: log.metadata,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          createdAt: log.createdAt ? new Date(log.createdAt) : new Date(),
        },
      });
    }
    stats.activityLogs = data.activityLogs.length;
  }

  return {
    success: true,
    message: 'Backup restored successfully',
    type: 'json',
    stats,
  };
}
