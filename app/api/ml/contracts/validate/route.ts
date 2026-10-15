import { eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { portalProfiles } from '@/lib/db/schema'
import { validateTrainingContract } from '@/lib/ml-services/contracts'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const contractSchema = z.object({
  task: z.enum(['internship_recommendation', 'resume_parsing', 'salary_prediction', 'fairness_audit']),
  datasetVersion: z.string().trim().max(160),
  datasetSource: z.string().trim().max(1000),
  dataOwner: z.string().trim().max(240),
  consentAndLegalBasis: z.string().trim().max(2000),
  targetDefinition: z.string().trim().max(1000),
  featureManifest: z.array(z.string().trim().max(160)).max(80),
  excludedFeatures: z.array(z.string().trim().max(160)).max(80),
  splitStrategy: z.string().trim().max(1000),
  leakageChecks: z.array(z.string().trim().max(1000)).max(40),
  evaluationMetrics: z.array(z.string().trim().max(200)).max(40),
  subgroupEvaluation: z.array(z.string().trim().max(1000)).max(80),
  humanReview: z.string().trim().max(2000),
  retentionPolicy: z.string().trim().max(1000),
}).strict()

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin contract validation is not allowed.' }, { status: 403 })

  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to validate a training contract.' }, { status: 401 })
  const [profile] = await db.select({ role: portalProfiles.role })
    .from(portalProfiles)
    .where(eq(portalProfiles.userId, session.user.id))
    .limit(1)
  if (profile?.role !== 'administrator') return NextResponse.json({ error: 'Administrator access is required.' }, { status: 403 })

  const reader = request.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 })
  const chunks: Uint8Array[] = []
  let bodySize = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      bodySize += value.byteLength
      if (bodySize > 32_000) {
        await reader.cancel()
        return NextResponse.json({ error: 'Training contract is too large.' }, { status: 413 })
      }
      chunks.push(value)
    }
  } catch {
    return NextResponse.json({ error: 'Unable to read request body.' }, { status: 400 })
  }

  const requestBody = new Uint8Array(bodySize)
  let offset = 0
  for (const chunk of chunks) {
    requestBody.set(chunk, offset)
    offset += chunk.byteLength
  }

  let body: unknown
  try { body = JSON.parse(new TextDecoder().decode(requestBody)) } catch { return NextResponse.json({ error: 'Invalid request body.' }, { status: 400 }) }
  const parsed = contractSchema.safeParse(body)
  if (!parsed.success) return NextResponse.json({ error: 'Check the contract fields and try again.' }, { status: 400 })

  const issues = validateTrainingContract(parsed.data)
  return NextResponse.json({
    valid: issues.length === 0,
    issues,
    deploymentAuthorized: false,
    note: 'A complete contract is documentation, not evidence of a trained or approved model. Artifact provenance, independent evaluation, privacy review, and human release approval remain separate requirements.',
  }, { headers: { 'Cache-Control': 'private, no-store, max-age=0' } })
}
