import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { authenticateRequest } from '@/lib/auth-middleware'

export async function GET(request: NextRequest) {
  const auth = await authenticateRequest(request)
  if (!auth) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  if (auth.role !== 'ADMIN') {
    return NextResponse.json({ error: 'Access denied' }, { status: 403 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const recruiterId = searchParams.get('recruiterId')
    const dateFrom = searchParams.get('dateFrom')
    const dateTo = searchParams.get('dateTo')

    // Build where clause with filters
    const where: Record<string, unknown> = {}

    if (recruiterId) {
      where.recruiterId = recruiterId
    }

    if (dateFrom || dateTo) {
      const calledAtFilter: Record<string, Date> = {}
      if (dateFrom) {
        calledAtFilter.gte = new Date(dateFrom)
      }
      if (dateTo) {
        calledAtFilter.lte = new Date(dateTo)
      }
      where.calledAt = calledAtFilter
    }

    // Fetch all call records matching the filter (unpaginated)
    const callRecords = await db.callRecord.findMany({
      where,
      include: {
        candidate: {
          select: {
            name: true,
            phone: true,
            role: true,
            location: true,
          },
        },
        recruiter: {
          select: {
            id: true,
            name: true,
            email: true,
          },
        },
        disposition: {
          select: {
            id: true,
            heading: true,
            type: true,
          },
        },
        client: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        calledAt: 'desc',
      },
    })

    // Fetch all active recruiters for the dropdown
    const recruiters = await db.user.findMany({
      where: { role: 'RECRUITER', isActive: true },
      select: { id: true, name: true, email: true },
      orderBy: { name: 'asc' },
    })

    return NextResponse.json({
      callRecords,
      recruiters,
    })
  } catch (error) {
    console.error('Failed to fetch team performance data:', error)
    return NextResponse.json(
      { error: 'Failed to fetch team performance data' },
      { status: 500 }
    )
  }
}
