import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portalProfiles } from '@/lib/db/schema'

export const runtime = 'nodejs'

const optionalText = (max: number) => z.union([z.string().trim().max(max), z.null()]).optional()
const profileSchema = z.object({
  headline: optionalText(160),
  institution: optionalText(160),
  branch: optionalText(100),
  graduationYear: z.union([z.number().int().min(2000).max(2100), z.string().regex(/^\d{4}$/).transform(Number).pipe(z.number().int().min(2000).max(2100)), z.null()]).optional(),
  cgpa: z.union([z.number().min(0).max(10), z.string().regex(/^\d{1,2}(\.\d{1,2})?$/).transform(Number).pipe(z.number().min(0).max(10)), z.null()]).optional(),
  skills: z.array(z.string().trim().min(1).max(60)).max(40).optional(),
  interests: z.array(z.string().trim().min(1).max(80)).max(20).optional(),
}).strict()

export async function PATCH(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to update your profile.' }, { status: 401 })
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eqProfileUser(session.user.id)).limit(1)
  if (!profile) return NextResponse.json({ error: 'Your profile is not available.' }, { status: 404 })
  if (profile.role !== 'student') return NextResponse.json({ error: 'Profile editing is not available for this account.' }, { status: 403 })

  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = profileSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Check your profile details and try again.' }, { status: 400 })
  const data = parsed.data
  const values = { ...data, cgpa: data.cgpa == null ? data.cgpa : String(data.cgpa), updatedAt: new Date() }
  const [updated] = await db.update(portalProfiles).set(values).where(eqProfileUser(session.user.id)).returning({
    role: portalProfiles.role, headline: portalProfiles.headline, institution: portalProfiles.institution, graduationYear: portalProfiles.graduationYear, branch: portalProfiles.branch, cgpa: portalProfiles.cgpa, skills: portalProfiles.skills, interests: portalProfiles.interests,
  })
  if (!updated) return NextResponse.json({ error: 'Unable to update your profile.' }, { status: 500 })
  return NextResponse.json({ profile: { ...updated, cgpa: updated.cgpa?.toString() ?? null } })
}

import { eq } from 'drizzle-orm'
const eqProfileUser = (userId: string) => eq(portalProfiles.userId, userId)
