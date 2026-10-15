import { Buffer } from 'node:buffer'
import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portalProfiles } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const MAX_RESUME_BYTES = 4 * 1024 * 1024
const resumeParseResponseSchema = z.object({
  task: z.literal('resume_parsing'),
  available: z.literal(true),
  lifecycle: z.literal('rules_based'),
  modelTrained: z.literal(false),
  sourceFormat: z.literal('pdf'),
  extraction: z.object({
    skills: z.array(z.string()),
    emailAddresses: z.array(z.string()),
    phoneNumbers: z.array(z.string()),
    sectionHeadingsPresent: z.array(z.string()),
    textCharacters: z.number().int().nonnegative(),
  }),
  confidence: z.object({ skills: z.string(), contactDetails: z.string() }),
  limitations: z.array(z.string()),
})

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

  const serviceUrl = process.env.ML_SERVICE_URL
  const serviceToken = process.env.ML_SERVICE_TOKEN
  if (!serviceUrl || !serviceToken) return NextResponse.json({ error: 'The separate ML service is not configured.' }, { status: 503 })

  let target: URL
  try {
    target = new URL('/v1/resume/parse-file', serviceUrl)
    if (target.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('HTTPS is required in production.')
  } catch {
    return NextResponse.json({ error: 'The ML service endpoint is not configured safely.' }, { status: 503 })
  }

  const upstreamForm = new FormData()
  upstreamForm.set('file', file, file.name)

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: { Authorization: `Bearer ${serviceToken}` },
      body: upstreamForm,
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status >= 500) return NextResponse.json({ error: 'The ML service is temporarily unavailable.' }, { status: 502 })
    const result: unknown = await response.json().catch(() => null)
    if (!response.ok) {
      const detail = result && typeof result === 'object' && 'detail' in result && typeof result.detail === 'string'
        ? result.detail
        : 'Unable to analyze this resume.'
      return NextResponse.json({ error: detail }, { status: response.status })
    }
    const parsed = resumeParseResponseSchema.safeParse(result)
    if (!parsed.success) return NextResponse.json({ error: 'The ML service returned an invalid extraction result.' }, { status: 502 })
    return NextResponse.json(parsed.data, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
  } catch {
    return NextResponse.json({ error: 'The ML service could not be reached.' }, { status: 502 })
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
