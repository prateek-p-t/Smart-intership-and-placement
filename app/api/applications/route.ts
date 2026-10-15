import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { applications, auditLogs, internships, portalProfiles } from '@/lib/db/schema'

export const runtime = 'nodejs'
const applicationSchema = z.object({ internshipId: z.string().trim().min(1).max(128) }).strict()

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to apply.' }, { status: 401 })
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Only student accounts can submit applications.' }, { status: 403 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = applicationSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid opportunity.' }, { status: 400 })
  const [listing] = await db.select({ id: internships.id }).from(internships).where(and(eq(internships.id, parsed.data.internshipId), eq(internships.status, 'published'))).limit(1)
  if (!listing) return NextResponse.json({ error: 'This opportunity is not available.' }, { status: 404 })

  const result = await db.transaction(async (tx) => {
    const [created] = await tx.insert(applications).values({ id: crypto.randomUUID(), userId: session.user.id, internshipId: listing.id, status: 'submitted' }).onConflictDoNothing().returning({ id: applications.id })
    if (created) await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorUserId: session.user.id, action: 'application.submitted', resourceType: 'application', resourceId: created.id, metadata: {} })
    return created
  })
  if (!result) return NextResponse.json({ error: 'You have already applied to this opportunity.' }, { status: 409 })
  return NextResponse.json({ id: result.id, status: 'submitted' }, { status: 201 })
}
