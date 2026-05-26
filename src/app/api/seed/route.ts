import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { authenticateRequest } from '@/lib/auth-middleware';

export async function POST(request: NextRequest) {
  try {
    // Gate seed behind admin auth or ALLOW_SEED env flag
    const allowSeed = process.env.ALLOW_SEED === 'true';
    if (!allowSeed) {
      const auth = await authenticateRequest(request);
      if (!auth || auth.role !== 'ADMIN') {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }
    // Create admin user
    const adminPassword = await hashPassword('admin123');
    const admin = await db.user.upsert({
      where: { email: 'admin@recruitment.com' },
      update: {},
      create: {
        email: 'admin@recruitment.com',
        name: 'Admin',
        password: adminPassword,
        role: 'ADMIN',
      },
    });

    // Create sample recruiter
    const recruiterPassword = await hashPassword('recruiter123');
    const recruiter = await db.user.upsert({
      where: { email: 'john@recruitment.com' },
      update: {},
      create: {
        email: 'john@recruitment.com',
        name: 'John Recruiter',
        phone: '+91-9876543210',
        password: recruiterPassword,
        role: 'RECRUITER',
      },
    });

    // Create default clients
    const defaultClients = ['Akolta', 'Zepto', '1Point1', 'Axis Maxlife'];
    for (const name of defaultClients) {
      await db.client.upsert({
        where: { name },
        update: {},
        create: { name },
      });
    }

    // Create default dispositions
    const defaultDispositions = [
      { heading: 'Shortlisted', type: 'SHORTLISTED' },
      { heading: 'Connected - Interested', type: 'CONNECTED' },
      { heading: 'Connected - Not Interested', type: 'NOT_INTERESTED' },
      { heading: 'Not Connected - Ringing', type: 'NOT_CONNECTED' },
      { heading: 'Not Connected - Switched Off', type: 'NOT_CONNECTED' },
      { heading: 'Not Connected - Busy', type: 'NOT_CONNECTED' },
    ];
    for (const disp of defaultDispositions) {
      await db.disposition.upsert({
        where: { id: `default-${disp.type}-${disp.heading.replace(/\s+/g, '-').toLowerCase()}` },
        update: {},
        create: { id: `default-${disp.type}-${disp.heading.replace(/\s+/g, '-').toLowerCase()}`, ...disp },
      });
    }

    // Create default message templates
    const defaultTemplates = [
      {
        name: 'Not Answered Template',
        type: 'NOT_ANSWERED',
        content: 'Hi {{candidate_name}}, this is {{recruiter_name}} from our recruitment team. We tried reaching you regarding the {{role}} position at {{location}}. Please call us back at your convenience. Thank you!',
      },
      {
        name: 'Shortlisted Template',
        type: 'SHORTLISTED',
        content: 'Hi {{candidate_name}}, great news! You have been shortlisted for the {{role}} position. Our team will share further details shortly. Looking forward to speaking with you. Regards, {{recruiter_name}}',
      },
    ];
    for (const tmpl of defaultTemplates) {
      await db.messageTemplate.upsert({
        where: { id: `default-${tmpl.type}` },
        update: {},
        create: { id: `default-${tmpl.type}`, ...tmpl },
      });
    }

    // Create sample call list with candidates
    const callList = await db.callList.create({
      data: {
        name: 'Tech Recruiting - June 2025',
        description: 'Active tech positions for June',
        source: 'MANUAL',
        createdBy: admin.id,
        candidates: {
          create: [
            { name: 'Rahul Sharma', phone: '+91-9876543211', role: 'Software Engineer', location: 'Bangalore' },
            { name: 'Priya Patel', phone: '+91-9876543212', role: 'Product Manager', location: 'Mumbai' },
            { name: 'Amit Kumar', phone: '+91-9876543213', role: 'Data Analyst', location: 'Delhi' },
            { name: 'Sneha Reddy', phone: '+91-9876543214', role: 'UX Designer', location: 'Hyderabad' },
            { name: 'Vikram Singh', phone: '+91-9876543215', role: 'DevOps Engineer', location: 'Pune' },
            { name: 'Anita Desai', phone: '+91-9876543216', role: 'Frontend Developer', location: 'Chennai' },
            { name: 'Rajesh Nair', phone: '+91-9876543217', role: 'Backend Developer', location: 'Bangalore' },
            { name: 'Kavita Joshi', phone: '+91-9876543218', role: 'QA Engineer', location: 'Noida' },
          ],
        },
      },
    });

    // Assign call list to recruiter
    await db.callListAssignment.create({
      data: {
        callListId: callList.id,
        recruiterId: recruiter.id,
      },
    });

    // Create sample call records for dashboard
    const dispositions = await db.disposition.findMany();
    const candidates = await db.candidate.findMany({ where: { callListId: callList.id } });

    const sampleRecords = [
      { candidateIdx: 0, dispType: 'SHORTLISTED', duration: 180, client: 'Akolta' },
      { candidateIdx: 1, dispType: 'CONNECTED', duration: 120, client: null },
      { candidateIdx: 2, dispType: 'NOT_CONNECTED', duration: 0, client: null },
      { candidateIdx: 3, dispType: 'SHORTLISTED', duration: 240, client: 'Zepto' },
      { candidateIdx: 4, dispType: 'NOT_INTERESTED', duration: 60, client: null },
    ];

    for (const record of sampleRecords) {
      const disp = dispositions.find(d => d.type === record.dispType);
      await db.callRecord.create({
        data: {
          candidateId: candidates[record.candidateIdx].id,
          recruiterId: recruiter.id,
          dispositionId: disp?.id || null,
          callDuration: record.duration,
          callStatus: 'COMPLETED',
          calledAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
        },
      });
    }

    // Log credentials server-side only — never returned in response
    console.log('Seed complete. Admin: admin@recruitment.com / admin123 | Recruiter: john@recruitment.com / recruiter123');

    return NextResponse.json({
      success: true,
      message: 'Database seeded',
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
