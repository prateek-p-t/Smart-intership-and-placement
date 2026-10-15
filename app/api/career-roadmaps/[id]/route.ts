import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { careerRoadmaps, portalProfiles } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const progressSchema = z.object({ milestoneId: z.string().trim().min(1).max(64) }).strict()

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin roadmap updates are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to update career roadmaps.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Career roadmaps are available to student accounts only.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const input = progressSchema.safeParse(body)
  if (!input.success) return NextResponse.json({ error: 'Choose a valid roadmap milestone.' }, { status: 400 })

  const { id } = await context.params
  const [roadmap] = await db.select({ milestones: careerRoadmaps.milestones, completedMilestones: careerRoadmaps.completedMilestones })
    .from(careerRoadmaps)
    .where(and(eq(careerRoadmaps.id, id), eq(careerRoadmaps.userId, session.user.id)))
    .limit(1)
  if (!roadmap) return NextResponse.json({ error: 'Career roadmap not found.' }, { status: 404 })
  if (!roadmap.milestones.some((milestone) => milestone.id === input.data.milestoneId)) {
    return NextResponse.json({ error: 'That milestone does not belong to this roadmap.' }, { status: 400 })
  }

  const completed = new Set(roadmap.completedMilestones)
  if (completed.has(input.data.milestoneId)) completed.delete(input.data.milestoneId)
  else completed.add(input.data.milestoneId)
  const completedMilestones = [...completed]
  const [updated] = await db.update(careerRoadmaps)
    .set({ completedMilestones, updatedAt: new Date() })
    .where(and(eq(careerRoadmaps.id, id), eq(careerRoadmaps.userId, session.user.id)))
    .returning({ completedMilestones: careerRoadmaps.completedMilestones, updatedAt: careerRoadmaps.updatedAt })

  return NextResponse.json({ completedMilestones: updated.completedMilestones, updatedAt: updated.updatedAt.toISOString() }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  if (!isSameOriginRequest(_request)) return NextResponse.json({ error: 'Cross-origin roadmap deletes are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to delete career roadmaps.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Career roadmaps are available to student accounts only.' }, { status: 403 })

  const { id } = await context.params
  const [deleted] = await db.delete(careerRoadmaps)
    .where(and(eq(careerRoadmaps.id, id), eq(careerRoadmaps.userId, session.user.id)))
    .returning({ id: careerRoadmaps.id })
  if (!deleted) return NextResponse.json({ error: 'Career roadmap not found.' }, { status: 404 })
  return NextResponse.json({ success: true })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'PATCH, DELETE' } })
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'PATCH, DELETE' } })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'PATCH, DELETE' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'PATCH, DELETE, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'PATCH, DELETE' } })
}
