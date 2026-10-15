import { Buffer } from 'node:buffer'
import { extractResumePdf } from '@/lib/ml-services/resume-extractor'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portalProfiles } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const MAX_RESUME_BYTES = 4 * 1024 * 1024
export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin ML requests are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to analyze your resume.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role })
    .from(portalProfiles)
    .where(eq(portalProfiles.userId, session.user.id))
    .limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Resume analysis is available to student accounts only.' }, { status: 403 })

  const maxRequestBytes = MAX_RESUME_BYTES + 64 * 1024
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    return NextResponse.json({ error: 'Resume must be 4 MB or smaller.' }, { status: 413 })
  }

  const contentType = request.headers.get('content-type')
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
    return NextResponse.json({ error: 'Choose a valid PDF resume and try again.' }, { status: 400 })
  }

  const reader = request.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'Choose a valid PDF resume and try again.' }, { status: 400 })
  const chunks: Buffer[] = []
  let receivedBytes = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      receivedBytes += value.byteLength
      if (receivedBytes > maxRequestBytes) {
        await reader.cancel().catch(() => undefined)
        return NextResponse.json({ error: 'Resume must be 4 MB or smaller.' }, { status: 413 })
      }
      chunks.push(Buffer.from(value))
    }
  } catch {
    return NextResponse.json({ error: 'Choose a valid PDF resume and try again.' }, { status: 400 })
  }

  let formData: FormData
  try {
    const body = Buffer.concat(chunks)
    formData = await new Response(body as BodyInit, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return NextResponse.json({ error: 'Choose a valid PDF resume and try again.' }, { status: 400 })
  }

  const file = formData.get('file')
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Choose a PDF resume to analyze.' }, { status: 400 })
  if (file.size > MAX_RESUME_BYTES) return NextResponse.json({ error: 'Resume must be 4 MB or smaller.' }, { status: 413 })
  if (file.type !== 'application/pdf' || !file.name.toLowerCase().endsWith('.pdf')) {
    return NextResponse.json({ error: 'Only PDF resumes are supported.' }, { status: 400 })
  }

  const fileBytes = new Uint8Array(await file.arrayBuffer())
  if (new TextDecoder().decode(fileBytes.subarray(0, 5)) !== '%PDF-') {
    return NextResponse.json({ error: 'The selected file is not a valid PDF.' }, { status: 400 })
  }

  try {
    const result = await extractResumePdf(fileBytes)
    return NextResponse.json(result, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch (error) {
    const message = error instanceof Error ? error.message : ''
    if (/too many pages|too much text|No readable text/i.test(message)) {
      return NextResponse.json({ error: message }, { status: 422 })
    }
    console.error('Resume parsing failed.', { name: error instanceof Error ? error.name : 'UnknownError' })
    return NextResponse.json({ error: 'The PDF could not be read. Try exporting or uploading a different PDF.' }, { status: 422 })
  }
}

export async function GET() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } })
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'POST' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'POST, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'POST' } })
}
