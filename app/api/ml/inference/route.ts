import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portalProfiles } from '@/lib/db/schema'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const taskRoutes = {
  resume_parsing: 'resume/parse',
  internship_recommendation: 'recommendations',
  job_candidate_matching: 'match',
  placement_prediction: 'placement/predict',
  eligibility_engine: 'eligibility',
  resume_ranking: 'rank',
  salary_prediction: 'salary/predict',
  skill_gap_analysis: 'skill-gap',
  interview_assistant: 'interview',
  knowledge_chatbot: 'knowledge/retrieve',
  resume_classification: 'resume/classify',
  fraud_duplicate_detection: 'fraud/check',
  fairness_audit: 'fairness/audit',
} as const

const taskRoles: Record<keyof typeof taskRoutes, string[]> = {
  resume_parsing: ['student'],
  internship_recommendation: ['student'],
  job_candidate_matching: ['company_recruiter'],
  placement_prediction: ['placement_officer', 'administrator'],
  eligibility_engine: ['student', 'company_recruiter', 'placement_officer', 'administrator'],
  resume_ranking: ['company_recruiter'],
  salary_prediction: ['student', 'placement_officer', 'administrator'],
  skill_gap_analysis: ['student', 'faculty', 'placement_officer'],
  interview_assistant: ['student'],
  knowledge_chatbot: ['student', 'company_recruiter', 'faculty', 'placement_officer', 'administrator'],
  resume_classification: ['student', 'company_recruiter'],
  fraud_duplicate_detection: ['placement_officer', 'administrator'],
  fairness_audit: ['administrator'],
}

const requestSchema = z.object({
  task: z.enum(Object.keys(taskRoutes) as [keyof typeof taskRoutes, ...(keyof typeof taskRoutes)[]]),
  payload: z.record(z.string(), z.unknown()),
}).strict()

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin ML requests are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to use this service.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role })
    .from(portalProfiles)
    .where(eq(portalProfiles.userId, session.user.id))
    .limit(1)
  if (!profile || !taskRoles.internship_recommendation.includes(profile.role) && !Object.values(taskRoles).some((roles) => roles.includes(profile.role))) {
    return NextResponse.json({ error: 'A valid portal role is required.' }, { status: 403 })
  }

  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > 65_536) return NextResponse.json({ error: 'ML request payload is too large.' }, { status: 413 })
  let rawBody: string
  try {
    rawBody = await request.text()
  } catch {
    return NextResponse.json({ error: 'Unable to read the request body.' }, { status: 400 })
  }
  if (Buffer.byteLength(rawBody, 'utf8') > 65_536) return NextResponse.json({ error: 'ML request payload is too large.' }, { status: 413 })

  let body: unknown
  try {
    body = JSON.parse(rawBody)
  } catch {
    return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  }
  const parsed = requestSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Choose a supported ML task and provide a JSON payload.' }, { status: 400 })
  if (!taskRoles[parsed.data.task].includes(profile.role)) return NextResponse.json({ error: 'Your role is not permitted to use this ML task.' }, { status: 403 })

  const serviceUrl = process.env.ML_SERVICE_URL
  const serviceToken = process.env.ML_SERVICE_TOKEN
  if (!serviceUrl || !serviceToken) return NextResponse.json({ error: 'The separate ML service is not configured.' }, { status: 503 })

  let target: URL
  try {
    target = new URL(`/v1/${taskRoutes[parsed.data.task]}`, serviceUrl)
    if (target.protocol !== 'https:' && process.env.NODE_ENV === 'production') throw new Error('HTTPS is required in production.')
  } catch {
    return NextResponse.json({ error: 'The ML service endpoint is not configured safely.' }, { status: 503 })
  }

  try {
    const response = await fetch(target, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${serviceToken}`,
        'Content-Type': 'application/json',
        'X-Request-ID': crypto.randomUUID(),
      },
      body: JSON.stringify({ ...parsed.data.payload, actorRole: profile.role }),
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status >= 500) return NextResponse.json({ error: 'The ML service is temporarily unavailable.' }, { status: 502 })
    const result: unknown = await response.json().catch(() => ({ error: 'The ML service returned an invalid response.' }))
    return NextResponse.json(result, { status: response.status, headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
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

const crypto = globalThis.crypto
const Buffer = (await import('node:buffer')).Buffer

