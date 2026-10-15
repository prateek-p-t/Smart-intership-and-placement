import { createHash } from 'node:crypto'
import { del, put } from '@vercel/blob'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { auditLogs, portalProfiles, resumeMetadata } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const MAX_RESUME_BYTES = 4 * 1024 * 1024
const PDF_SIGNATURE = '%PDF-'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to view your resumes.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Resume access is available to student accounts only.' }, { status: 403 })

  const resumes = await db.select({ id: resumeMetadata.id, originalName: resumeMetadata.originalName, byteSize: resumeMetadata.byteSize, createdAt: resumeMetadata.createdAt })
    .from(resumeMetadata)
    .where(eq(resumeMetadata.userId, session.user.id))
    .orderBy(resumeMetadata.createdAt)

  return NextResponse.json({ resumes: resumes.map((resume) => ({ ...resume, createdAt: resume.createdAt.toISOString() })) }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin upload requests are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to upload a resume.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Resume uploads are available to student accounts only.' }, { status: 403 })

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > MAX_RESUME_BYTES + 64 * 1024) {
    return NextResponse.json({ error: 'Resume must be 4 MB or smaller.' }, { status: 413 })
  }

  let formData: FormData
  try {
    formData = await request.formData()
  } catch {
    return NextResponse.json({ error: 'Choose a valid PDF resume and try again.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a PDF resume to upload.' }, { status: 400 })
  if (file.size > MAX_RESUME_BYTES) return NextResponse.json({ error: 'Resume must be 4 MB or smaller.' }, { status: 413 })
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF resumes are supported.' }, { status: 400 })
  }

  const bytes = Buffer.from(await file.arrayBuffer())
  if (bytes.subarray(0, PDF_SIGNATURE.length).toString('ascii') !== PDF_SIGNATURE) {
    return NextResponse.json({ error: 'The selected file is not a valid PDF.' }, { status: 400 })
  }

  const id = crypto.randomUUID()
  const pathname = `resumes/${session.user.id}/${id}.pdf`
  const originalName = (file.name.split(/[\\/]/).pop() ?? 'resume.pdf').replace(/[^\p{L}\p{N}._ -]/gu, '').trim().slice(0, 160) || 'resume.pdf'
  const sha256 = createHash('sha256').update(bytes).digest('hex')

  try {
    const blob = await put(pathname, bytes, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: 'application/pdf',
      cacheControlMaxAge: 60,
    })

    try {
      const [resume] = await db.transaction(async (tx) => {
        const inserted = await tx.insert(resumeMetadata).values({
          id,
          userId: session.user.id,
          storageKey: blob.pathname,
          originalName,
          mediaType: 'application/pdf',
          byteSize: file.size,
          sha256,
        }).returning({ id: resumeMetadata.id, originalName: resumeMetadata.originalName, byteSize: resumeMetadata.byteSize, createdAt: resumeMetadata.createdAt })
        await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorUserId: session.user.id, action: 'resume.uploaded', resourceType: 'resume', resourceId: id, metadata: { byteSize: file.size, mediaType: 'application/pdf' } })
        return inserted
      })

      return NextResponse.json({ resume: { ...resume, createdAt: resume.createdAt.toISOString() } }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
    } catch (error) {
      try {
        await del(blob.pathname)
      } catch (cleanupError) {
        console.error('Resume blob cleanup failed after metadata insert error.', cleanupError)
      }
      throw error
    }
  } catch (error) {
    console.error('Resume upload failed.', error)
    return NextResponse.json({ error: 'Unable to save your resume right now. Please try again.' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin delete requests are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to delete a resume.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Resume access is available to student accounts only.' }, { status: 403 })

  let body: unknown
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  if (!body || typeof body !== 'object' || !('id' in body) || typeof body.id !== 'string') {
    return NextResponse.json({ error: 'Choose a resume to delete.' }, { status: 400 })
  }

  const [resume] = await db.select({ id: resumeMetadata.id, storageKey: resumeMetadata.storageKey })
    .from(resumeMetadata)
    .where(and(eq(resumeMetadata.id, body.id), eq(resumeMetadata.userId, session.user.id)))
    .limit(1)
  if (!resume) return NextResponse.json({ error: 'Resume not found.' }, { status: 404 })

  try {
    await del(resume.storageKey)
    await db.transaction(async (tx) => {
      await tx.delete(resumeMetadata).where(eq(resumeMetadata.id, resume.id))
      await tx.insert(auditLogs).values({ id: crypto.randomUUID(), actorUserId: session.user.id, action: 'resume.deleted', resourceType: 'resume', resourceId: resume.id, metadata: {} })
    })
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Resume deletion failed.', error)
    return NextResponse.json({ error: 'Unable to delete this resume right now. Please try again.' }, { status: 500 })
  }
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, POST, DELETE' } })
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, POST, DELETE' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'GET, POST, DELETE, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET, POST, DELETE' } })
}
