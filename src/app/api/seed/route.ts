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
      if (!auth || auth.role !== 'SUPER_ADMIN') {
        return NextResponse.json({ error: 'Access denied' }, { status: 403 });
      }
    }

    // ── 1. Create default subscription plans ──────────────────────────────
    const plans = [
      {
        id: 'plan-free',
        name: 'Free',
        description: 'Get started with basic calling features',
        type: 'FREE',
        monthlyPrice: 0,
        yearlyPrice: 0,
        maxUsers: 2,
        maxNumbers: 500,
        dailyUploadLimit: 50,
        maxProjects: 1,
        maxDepartments: 2,
        isDefault: true,
        features: JSON.stringify(['Basic calling', 'Manual upload', '5 candidates per list']),
      },
      {
        id: 'plan-starter',
        name: 'Starter',
        description: 'For small recruiting teams',
        type: 'STARTER',
        monthlyPrice: 999,
        yearlyPrice: 9990,
        maxUsers: 5,
        maxNumbers: 2000,
        dailyUploadLimit: 200,
        maxProjects: 3,
        maxDepartments: 5,
        features: JSON.stringify(['CSV upload', 'WhatsApp templates', 'Basic analytics', 'Call recordings']),
      },
      {
        id: 'plan-business',
        name: 'Business',
        description: 'For growing recruitment agencies',
        type: 'BUSINESS',
        monthlyPrice: 4999,
        yearlyPrice: 49990,
        maxUsers: 25,
        maxNumbers: 10000,
        dailyUploadLimit: 1000,
        maxProjects: 10,
        maxDepartments: 15,
        features: JSON.stringify(['Google Sheets sync', 'Advanced analytics', 'Custom fields', 'Team management', 'API access']),
      },
      {
        id: 'plan-enterprise',
        name: 'Enterprise',
        description: 'For large-scale recruitment operations',
        type: 'ENTERPRISE',
        monthlyPrice: 14999,
        yearlyPrice: 149990,
        maxUsers: 100,
        maxNumbers: 50000,
        dailyUploadLimit: 5000,
        maxProjects: 50,
        maxDepartments: 50,
        features: JSON.stringify(['Everything in Business', 'White-label', 'Dedicated support', 'SLA guarantee', 'Custom integrations', 'Audit logs']),
      },
      {
        id: 'plan-custom',
        name: 'Custom',
        description: 'Tailored solutions for enterprise needs',
        type: 'CUSTOM',
        monthlyPrice: 0,
        yearlyPrice: 0,
        maxUsers: 999,
        maxNumbers: 999999,
        dailyUploadLimit: 99999,
        maxProjects: 999,
        maxDepartments: 999,
        features: JSON.stringify(['Fully customizable', 'On-premise option', 'Custom SLA', 'Dedicated account manager']),
      },
    ];

    for (const plan of plans) {
      await db.subscriptionPlan.upsert({
        where: { id: plan.id },
        update: {},
        create: plan,
      });
    }

    // ── 2. Create default "Akolta" organization with ENTERPRISE plan ─────
    const akoltaOrg = await db.organization.upsert({
      where: { slug: 'akolta' },
      update: {},
      create: {
        name: 'Akolta',
        slug: 'akolta',
        email: 'admin@akolta.com',
        phone: '+91-22-40001234',
        address: 'Mumbai, Maharashtra, India',
        isActive: true,
        maxUsers: 100,
        maxNumbers: 50000,
        dailyUploadLimit: 5000,
        subscriptionPlanId: 'plan-enterprise',
        subscriptionStatus: 'ACTIVE',
        subscriptionStartsAt: new Date(),
        subscriptionEndsAt: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
      },
    });

    // ── 3. Create admin user as SUPER_ADMIN linked to Akolta org ─────────
    const adminPassword = await hashPassword('admin123');
    const admin = await db.user.upsert({
      where: { email: 'admin@recruitment.com' },
      update: {},
      create: {
        email: 'admin@recruitment.com',
        name: 'Admin',
        password: adminPassword,
        role: 'SUPER_ADMIN',
        organizationId: akoltaOrg.id,
        uploadPermission: true,
        createListPermission: true,
      },
    });

    // ── 4. Create recruiter as USER linked to Akolta org ────────────────
    const recruiterPassword = await hashPassword('recruiter123');
    const recruiter = await db.user.upsert({
      where: { email: 'john@recruitment.com' },
      update: {},
      create: {
        email: 'john@recruitment.com',
        name: 'John Recruiter',
        phone: '+91-9876543210',
        password: recruiterPassword,
        role: 'USER',
        organizationId: akoltaOrg.id,
      },
    });

    // ── 5. Create default clients with organizationId ────────────────────
    const defaultClients = [
      { id: 'client-akolta', name: 'Akolta' },
      { id: 'client-zepto', name: 'Zepto' },
      { id: 'client-1point1', name: '1Point1' },
      { id: 'client-axis-maxlife', name: 'Axis Maxlife' },
    ];

    for (const client of defaultClients) {
      await db.client.upsert({
        where: { id: client.id },
        update: {},
        create: {
          ...client,
          organizationId: akoltaOrg.id,
        },
      });
    }

    // ── 6. Create default dispositions with organizationId ──────────────
    const defaultDispositions = [
      { heading: 'Shortlisted', type: 'SHORTLISTED' },
      { heading: 'Connected - Interested', type: 'CONNECTED' },
      { heading: 'Connected - Not Interested', type: 'NOT_INTERESTED' },
      { heading: 'Not Connected - Ringing', type: 'NOT_CONNECTED' },
      { heading: 'Not Connected - Switched Off', type: 'NOT_CONNECTED' },
      { heading: 'Not Connected - Busy', type: 'NOT_CONNECTED' },
    ];

    for (const disp of defaultDispositions) {
      const slug = `default-${disp.type}-${disp.heading.replace(/\s+/g, '-').toLowerCase()}`;
      await db.disposition.upsert({
        where: { id: slug },
        update: {},
        create: {
          id: slug,
          heading: disp.heading,
          type: disp.type,
          organizationId: akoltaOrg.id,
        },
      });
    }

    // ── 7. Create default message templates with organizationId ──────────
    const defaultTemplates = [
      {
        id: 'tmpl-not-answered',
        name: 'Not Answered Template',
        type: 'NOT_ANSWERED',
        content:
          'Hi {{candidate_name}}, this is {{recruiter_name}} from our recruitment team. We tried reaching you regarding the {{role}} position at {{location}}. Please call us back at your convenience. Thank you!',
      },
      {
        id: 'tmpl-shortlisted',
        name: 'Shortlisted Template',
        type: 'SHORTLISTED',
        content:
          'Hi {{candidate_name}}, great news! You have been shortlisted for the {{role}} position. Our team will share further details shortly. Looking forward to speaking with you. Regards, {{recruiter_name}}',
      },
    ];

    for (const tmpl of defaultTemplates) {
      await db.messageTemplate.upsert({
        where: { id: tmpl.id },
        update: {},
        create: {
          ...tmpl,
          organizationId: akoltaOrg.id,
        },
      });
    }

    // ── 8. Create sample call list with candidates (all with organizationId) ─
    const callList = await db.callList.create({
      data: {
        name: 'Tech Recruiting - June 2025',
        description: 'Active tech positions for June',
        source: 'MANUAL',
        createdBy: admin.id,
        organizationId: akoltaOrg.id,
        candidates: {
          create: [
            { name: 'Rahul Sharma', phone: '+91-9876543211', role: 'Software Engineer', location: 'Bangalore', organizationId: akoltaOrg.id },
            { name: 'Priya Patel', phone: '+91-9876543212', role: 'Product Manager', location: 'Mumbai', organizationId: akoltaOrg.id },
            { name: 'Amit Kumar', phone: '+91-9876543213', role: 'Data Analyst', location: 'Delhi', organizationId: akoltaOrg.id },
            { name: 'Sneha Reddy', phone: '+91-9876543214', role: 'UX Designer', location: 'Hyderabad', organizationId: akoltaOrg.id },
            { name: 'Vikram Singh', phone: '+91-9876543215', role: 'DevOps Engineer', location: 'Pune', organizationId: akoltaOrg.id },
            { name: 'Anita Desai', phone: '+91-9876543216', role: 'Frontend Developer', location: 'Chennai', organizationId: akoltaOrg.id },
            { name: 'Rajesh Nair', phone: '+91-9876543217', role: 'Backend Developer', location: 'Bangalore', organizationId: akoltaOrg.id },
            { name: 'Kavita Joshi', phone: '+91-9876543218', role: 'QA Engineer', location: 'Noida', organizationId: akoltaOrg.id },
          ],
        },
      },
    });

    // ── 9. Create call list assignment (with organizationId) ──────────────
    await db.callListAssignment.create({
      data: {
        callListId: callList.id,
        recruiterId: recruiter.id,
        organizationId: akoltaOrg.id,
      },
    });

    // ── 10. Create sample call records (with organizationId) ─────────────
    const dispositions = await db.disposition.findMany({ where: { organizationId: akoltaOrg.id } });
    const candidates = await db.candidate.findMany({ where: { callListId: callList.id } });
    const clientAkolta = await db.client.findFirst({ where: { id: 'client-akolta' } });
    const clientZepto = await db.client.findFirst({ where: { id: 'client-zepto' } });

    const sampleRecords = [
      { candidateIdx: 0, dispType: 'SHORTLISTED', duration: 180, clientId: clientAkolta?.id },
      { candidateIdx: 1, dispType: 'CONNECTED', duration: 120, clientId: null },
      { candidateIdx: 2, dispType: 'NOT_CONNECTED', duration: 0, clientId: null },
      { candidateIdx: 3, dispType: 'SHORTLISTED', duration: 240, clientId: clientZepto?.id },
      { candidateIdx: 4, dispType: 'NOT_INTERESTED', duration: 60, clientId: null },
    ];

    for (const record of sampleRecords) {
      const disp = dispositions.find((d) => d.type === record.dispType);
      await db.callRecord.create({
        data: {
          candidateId: candidates[record.candidateIdx].id,
          recruiterId: recruiter.id,
          dispositionId: disp?.id || null,
          clientId: record.clientId || null,
          callDuration: record.duration,
          callStatus: 'COMPLETED',
          calledAt: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000),
          organizationId: akoltaOrg.id,
        },
      });
    }

    // ── 11. Create default custom designations ───────────────────────────
    const defaultDesignations = [
      'Recruiter',
      'Sales Associate',
      'Telecaller',
      'Business Development Executive',
      'Customer Support',
      'Relationship Manager',
      'Collection Agent',
    ];

    for (const designation of defaultDesignations) {
      const slug = `designation-${designation.replace(/\s+/g, '-').toLowerCase()}`;
      await db.customDesignation.upsert({
        where: { id: slug },
        update: {},
        create: {
          id: slug,
          name: designation,
          organizationId: akoltaOrg.id,
        },
      });
    }

    // ── 12. Log credentials to console ────────────────────────────────────
    console.log('');
    console.log('═══════════════════════════════════════════════════');
    console.log('  ✅ Seed Complete — RecruitPro Database Initialized');
    console.log('═══════════════════════════════════════════════════');
    console.log(`  Organization : ${akoltaOrg.name} (${akoltaOrg.slug})`);
    console.log(`  Plan         : Enterprise (ACTIVE)`);
    console.log('');
    console.log('  Admin Credentials:');
    console.log(`    Email    : admin@recruitment.com`);
    console.log(`    Password : admin123`);
    console.log(`    Role     : SUPER_ADMIN`);
    console.log('');
    console.log('  Recruiter Credentials:');
    console.log(`    Email    : john@recruitment.com`);
    console.log(`    Password : recruiter123`);
    console.log(`    Role     : USER`);
    console.log('═══════════════════════════════════════════════════');
    console.log('');

    return NextResponse.json({
      success: true,
      message: 'Database seeded with multi-tenant data',
      organization: {
        id: akoltaOrg.id,
        name: akoltaOrg.name,
        slug: akoltaOrg.slug,
      },
    });
  } catch (error) {
    console.error('Seed error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
