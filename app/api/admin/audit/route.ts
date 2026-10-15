import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLogs, portalProfiles, user } from '@/lib/db/schema'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to access audit activity.' }, { status: 401 })
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'administrator') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })
  const entries = await db.select({
    id: auditLogs.id, action: auditLogs.action, resourceType: auditLogs.resourceType,
    resourceId: auditLogs.resourceId, metadata: auditLogs.metadata,
    createdAt: auditLogs.createdAt, actorName: user.name, actorEmail: user.email,
  }).from(auditLogs).leftJoin(user, eq(auditLogs.actorUserId, user.id))
    .orderBy(desc(auditLogs.createdAt)).limit(100)
  return NextResponse.json({ entries: entries.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() })) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'GET, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } })
}
