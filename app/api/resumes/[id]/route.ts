import { get } from '@vercel/blob'
import { and, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portalProfiles, resumeMetadata } from '@/lib/db/schema'

export const runtime = 'nodejs'

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to download a resume.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Resume access is available to student accounts only.' }, { status: 403 })

  const { id } = await params
  const [resume] = await db.select({ storageKey: resumeMetadata.storageKey, originalName: resumeMetadata.originalName })
    .from(resumeMetadata)
    .where(and(eq(resumeMetadata.id, id), eq(resumeMetadata.userId, session.user.id)))
    .limit(1)
  if (!resume) return NextResponse.json({ error: 'Resume not found.' }, { status: 404 })

  try {
    const blob = await get(resume.storageKey, { access: 'private' })
    if (!blob || blob.statusCode === 304) return NextResponse.json({ error: 'Resume not found.' }, { status: 404 })

    const filename = resume.originalName.replace(/[^\x20-\x7E"\\]/g, '_')
    return new Response(blob.stream, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(resume.originalName)}`,
        'Content-Length': String(blob.blob.size),
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    })
  } catch (error) {
    console.error('Resume download failed.', error)
    return NextResponse.json({ error: 'Unable to download this resume right now. Please try again.' }, { status: 500 })
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'GET, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET' } })
}
