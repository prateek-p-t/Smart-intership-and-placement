import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLogs, internships, portalProfiles, user } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const reviewSchema = z.object({
  listingId: z.string().trim().min(1).max(128),
  decision: z.enum(['publish', 'reject']),
  reason: z.string().trim().max(500).optional(),
}).strict()

async function getReviewer() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { error: NextResponse.json({ error: 'Sign in to access listing review.' }, { status: 401 }) }
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'placement_officer' && profile?.role !== 'administrator') {
    return { error: NextResponse.json({ error: 'Placement-office access is required.' }, { status: 403 }) }
  }
  return { userId: session.user.id }
}

export async function GET() {
  const reviewer = await getReviewer()
  if ('error' in reviewer) return reviewer.error
  const rows = await db.select({
    id: internships.id,
    title: internships.title,
    companyName: internships.companyName,
    location: internships.location,
    workMode: internships.workMode,
    description: internships.description,
    requiredSkills: internships.requiredSkills,
    deadline: internships.deadline,
    submittedAt: internships.createdAt,
    recruiterName: user.name,
    recruiterEmail: user.email,
  }).from(internships)
    .leftJoin(user, eq(internships.ownerUserId, user.id))
    .where(eq(internships.status, 'pending_review'))
    .orderBy(desc(internships.createdAt))
    .limit(100)
  return NextResponse.json({ listings: rows.map((row) => ({ ...row, deadline: row.deadline ? String(row.deadline) : null, submittedAt: row.submittedAt.toISOString() })) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin review requests are not allowed.' }, { status: 403 })
  const reviewer = await getReviewer()
  if ('error' in reviewer) return reviewer.error
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = reviewSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid review decision.' }, { status: 400 })

  const nextStatus = parsed.data.decision === 'publish' ? 'published' : 'rejected'
  const [updated] = await db.transaction(async (tx) => {
    const result = await tx.update(internships)
      .set({ status: nextStatus, updatedAt: new Date() })
      .where(and(eq(internships.id, parsed.data.listingId), eq(internships.status, 'pending_review')))
      .returning({ id: internships.id, title: internships.title, status: internships.status })
    if (result[0]) await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: reviewer.userId,
      action: `internship.${parsed.data.decision === 'publish' ? 'published' : 'rejected'}`,
      resourceType: 'internship',
      resourceId: result[0].id,
      metadata: { reason: parsed.data.reason ?? null },
    })
    return result
  })
  if (!updated) return NextResponse.json({ error: 'This listing is no longer awaiting review.' }, { status: 409 })
  return NextResponse.json({ listing: updated })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, PATCH' } })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, PATCH' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'GET, PATCH, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET, PATCH' } })
}
