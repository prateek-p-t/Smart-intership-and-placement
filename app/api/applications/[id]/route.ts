import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { applications, auditLogs, internships, portalProfiles } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'
const stageSchema = z.object({ status: z.enum(['reviewing', 'interview', 'offered', 'rejected']) }).strict()

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin application updates are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to manage applications.' }, { status: 401 })
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'company_recruiter') return NextResponse.json({ error: 'Recruiter access is required.' }, { status: 403 })
  const { id } = await context.params
  if (!id || id.length > 128) return NextResponse.json({ error: 'Choose a valid application.' }, { status: 400 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = stageSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid application stage.' }, { status: 400 })

  const [ownedApplication] = await db.select({ id: applications.id, status: applications.status })
    .from(applications)
    .innerJoin(internships, eq(applications.internshipId, internships.id))
    .where(and(eq(applications.id, id), eq(internships.ownerUserId, session.user.id)))
    .limit(1)
  if (!ownedApplication) return NextResponse.json({ error: 'Application not found.' }, { status: 404 })
  if (ownedApplication.status === 'rejected' || ownedApplication.status === 'offered') {
    return NextResponse.json({ error: 'This application has reached a final stage.' }, { status: 409 })
  }

  const [updated] = await db.transaction(async (tx) => {
    const result = await tx.update(applications).set({ status: parsed.data.status, updatedAt: new Date() })
      .where(and(eq(applications.id, id), eq(applications.status, ownedApplication.status))).returning({ id: applications.id, status: applications.status })
    if (result[0]) await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorUserId: session.user.id, action: 'application.stage_updated',
      resourceType: 'application', resourceId: id,
      metadata: { from: ownedApplication.status, to: parsed.data.status },
    })
    return result
  })
  if (!updated) return NextResponse.json({ error: 'This application changed while you were updating it.' }, { status: 409 })
  return NextResponse.json({ application: updated })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'PATCH' } })
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'PATCH' } })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'PATCH' } })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'PATCH' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'PATCH, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'PATCH' } })
}
