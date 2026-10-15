import { and, eq, inArray } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLogs, facultyStudentAssignments, portalProfiles } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'
const assignmentSchema = z.object({
  facultyUserId: z.string().trim().min(1).max(128),
  studentUserId: z.string().trim().min(1).max(128),
}).strict().refine((assignment) => assignment.facultyUserId !== assignment.studentUserId)

async function getAdministrator() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return { response: NextResponse.json({ error: 'Sign in to manage faculty assignments.' }, { status: 401 }) }
  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'administrator') return { response: NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 }) }
  return { userId: session.user.id }
}

async function validateAssignment(facultyUserId: string, studentUserId: string) {
  const profiles = await db.select({ userId: portalProfiles.userId, role: portalProfiles.role })
    .from(portalProfiles)
    .where(inArray(portalProfiles.userId, [facultyUserId, studentUserId]))
  return profiles.some((profile) => profile.userId === facultyUserId && profile.role === 'faculty')
    && profiles.some((profile) => profile.userId === studentUserId && profile.role === 'student')
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin assignment changes are not allowed.' }, { status: 403 })
  const admin = await getAdministrator()
  if ('response' in admin) return admin.response
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = assignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a faculty member and a student.' }, { status: 400 })
  const { facultyUserId, studentUserId } = parsed.data
  if (!(await validateAssignment(facultyUserId, studentUserId))) return NextResponse.json({ error: 'The selected accounts must have faculty and student roles.' }, { status: 400 })

  const assignment = await db.transaction(async (tx) => {
    const [created] = await tx.insert(facultyStudentAssignments).values({
      facultyUserId,
      studentUserId,
      assignedByUserId: admin.userId,
    }).onConflictDoNothing().returning({ facultyUserId: facultyStudentAssignments.facultyUserId })
    if (!created) return null
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: admin.userId,
      action: 'faculty.student_assigned',
      resourceType: 'faculty_student_assignment',
      resourceId: studentUserId,
      metadata: { facultyUserId, studentUserId },
    })
    return created
  })
  if (!assignment) return NextResponse.json({ error: 'This student is already assigned to that faculty member.' }, { status: 409 })
  return NextResponse.json({ facultyUserId, studentUserId }, { status: 201 })
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin assignment changes are not allowed.' }, { status: 403 })
  const admin = await getAdministrator()
  if ('response' in admin) return admin.response
  let body: unknown
  try { body = await request.json() } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = assignmentSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a valid faculty assignment.' }, { status: 400 })
  const { facultyUserId, studentUserId } = parsed.data
  const assignment = await db.transaction(async (tx) => {
    const [removed] = await tx.delete(facultyStudentAssignments).where(and(
      eq(facultyStudentAssignments.facultyUserId, facultyUserId),
      eq(facultyStudentAssignments.studentUserId, studentUserId),
    )).returning({ studentUserId: facultyStudentAssignments.studentUserId })
    if (!removed) return null
    await tx.insert(auditLogs).values({
      id: crypto.randomUUID(),
      actorUserId: admin.userId,
      action: 'faculty.student_unassigned',
      resourceType: 'faculty_student_assignment',
      resourceId: studentUserId,
      metadata: { facultyUserId, studentUserId },
    })
    return removed
  })
  if (!assignment) return NextResponse.json({ error: 'Faculty assignment not found.' }, { status: 404 })
  return NextResponse.json({ facultyUserId, studentUserId })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'POST, DELETE, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST, DELETE, OPTIONS' } })
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST, DELETE, OPTIONS' } })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST, DELETE, OPTIONS' } })
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST, DELETE, OPTIONS' } })
}
