import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLogs, internships, portalProfiles } from '@/lib/db/schema'

export const runtime = 'nodejs'
const listingSchema = z.object({
  title: z.string().trim().min(3).max(120),
  companyName: z.string().trim().min(2).max(120),
  location: z.string().trim().min(2).max(160),
  description: z.string().trim().min(30).max(3000),
  workMode: z.enum(['On-site', 'Hybrid', 'Remote']),
  requiredSkills: z.array(z.string().trim().min(1).max(60)).max(20),
  deadline: z.union([z.iso.date(), z.null()]).optional(),
}).strict()

export async function POST(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to submit a listing.' }, { status: 401 })
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'company_recruiter') return NextResponse.json({ error: 'A verified recruiter account is required.' }, { status: 403 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = listingSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Check the listing details and try again.' }, { status: 400 })
  const id = crypto.randomUUID()
  const [listing] = await db.transaction(async (tx) => {
    const created = await tx.insert(internships).values({
      id,
      ownerUserId: session.user.id,
      companyName: parsed.data.companyName,
      title: parsed.data.title,
      location: parsed.data.location,
      workMode: parsed.data.workMode,
      description: parsed.data.description,
      requiredSkills: [...new Set(parsed.data.requiredSkills)],
      eligibility: {},
      deadline: parsed.data.deadline ?? null,
      status: 'pending_review',
    }).returning({ id: internships.id, status: internships.status })
    await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorUserId: session.user.id, action: 'internship.submitted_for_review', resourceType: 'internship', resourceId: id, metadata: {} })
    return created
  })
  return NextResponse.json(listing, { status: 201 })
}
