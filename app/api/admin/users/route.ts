import { count, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLogs, portalProfiles, profileRoleNames, user } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'
const roleSchema = z.object({ userId: z.string().trim().min(1).max(128), role: z.enum(profileRoleNames) }).strict()

async function isAdministrator(userId: string) {
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, userId)).limit(1)
  return profile?.role === 'administrator'
}

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to access user administration.' }, { status: 401 })
  if (!(await isAdministrator(session.user.id))) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
  const users = await db.select({ id: user.id, name: user.name, email: user.email, createdAt: user.createdAt, role: portalProfiles.role })
    .from(user).leftJoin(portalProfiles, eq(user.id, portalProfiles.userId)).orderBy(desc(user.createdAt)).limit(200)
  return NextResponse.json({ users: users.map((entry) => ({ ...entry, role: entry.role ?? 'student', createdAt: entry.createdAt.toISOString() })) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function PATCH(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin role updates are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to manage roles.' }, { status: 401 })
  if (!(await isAdministrator(session.user.id))) return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = roleSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid account and role.' }, { status: 400 })
  if (parsed.data.userId === session.user.id && parsed.data.role !== 'administrator') {
    return NextResponse.json({ error: 'You cannot remove your own administrator access.' }, { status: 409 })
  }
  const [target] = await db.select({ id: user.id }).from(user).where(eq(user.id, parsed.data.userId)).limit(1)
  if (!target) return NextResponse.json({ error: 'User not found.' }, { status: 404 })
  const [current] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, target.id)).limit(1)
  if (current?.role === 'administrator' && parsed.data.role !== 'administrator') {
    const [administratorCount] = await db.select({ total: count() }).from(portalProfiles).where(eq(portalProfiles.role, 'administrator'))
    if ((administratorCount?.total ?? 0) <= 1) return NextResponse.json({ error: 'At least one administrator must remain.' }, { status: 409 })
  }

  await db.transaction(async (tx) => {
    await tx.insert(portalProfiles).values({ userId: target.id, role: parsed.data.role }).onConflictDoUpdate({
      target: portalProfiles.userId,
      set: { role: parsed.data.role, updatedAt: new Date() },
    })
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(), actorUserId: session.user.id, action: 'user.role_changed',
      resourceType: 'user', resourceId: target.id,
      metadata: { from: current?.role ?? 'student', to: parsed.data.role },
    })
  })
  return NextResponse.json({ userId: target.id, role: parsed.data.role })
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
