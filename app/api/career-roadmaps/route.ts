import { Buffer } from 'node:buffer'
import { generateText, Output } from 'ai'
import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { z } from 'zod'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { careerRoadmaps, portalProfiles } from '@/lib/db/schema'
import { explainSkillFit } from '@/lib/portal/logic'
import { serializeCareerRoadmap } from '@/lib/portal/roadmap-types'
import { isSameOriginRequest } from '@/lib/security/origin'

export const runtime = 'nodejs'

const MAX_RESUME_BYTES = 4 * 1024 * 1024
const PDF_SIGNATURE = '%PDF-'
const generatedRoadmapSchema = z.object({
  roleSummary: z.string().trim().min(30).max(600),
  resumeSkills: z.array(z.string().trim().min(1).max(80)).max(60),
  targetSkills: z.array(z.string().trim().min(1).max(80)).min(4).max(12),
  milestones: z.array(z.object({
    title: z.string().trim().min(3).max(100),
    objective: z.string().trim().min(10).max(360),
    activity: z.string().trim().min(10).max(500),
    estimatedHours: z.number().int().min(1).max(120),
  }).strict()).min(3).max(6),
}).strict()

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to view career roadmaps.' }, { status: 401 })

  const [profile] = await db.select({ role: portalProfiles.role }).from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Career roadmaps are available to student accounts only.' }, { status: 403 })

  const rows = await db.select().from(careerRoadmaps).where(eq(careerRoadmaps.userId, session.user.id)).orderBy(desc(careerRoadmaps.updatedAt)).limit(20)
  const roadmaps = rows.map((row) => serializeCareerRoadmap({
    id: row.id,
    targetRole: row.targetRole,
    targetSkills: row.targetSkills,
    matchedSkills: row.matchedSkills,
    missingSkills: row.missingSkills,
    matchScore: row.matchScore,
    roleSummary: row.roleSummary,
    milestones: row.milestones,
    sourceResumeId: row.sourceResumeId,
    completedMilestones: row.completedMilestones,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }))
  return NextResponse.json({ roadmaps }, { headers: { 'Cache-Control': 'private, no-store' } })
}

export async function POST(request: Request) {
  if (!isSameOriginRequest(request)) return NextResponse.json({ error: 'Cross-origin roadmap requests are not allowed.' }, { status: 403 })
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to create a career roadmap.' }, { status: 401 })

  const [profile] = await db.select().from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (profile?.role !== 'student') return NextResponse.json({ error: 'Career roadmaps are available to student accounts only.' }, { status: 403 })

  const maxRequestBytes = MAX_RESUME_BYTES + 64 * 1024
  const contentLength = Number(request.headers.get('content-length'))
  if (Number.isFinite(contentLength) && contentLength > maxRequestBytes) {
    return NextResponse.json({ error: 'Resume must be 4 MB or smaller.' }, { status: 413 })
  }
  const contentType = request.headers.get('content-type')
  if (!contentType?.toLowerCase().startsWith('multipart/form-data;')) {
    return NextResponse.json({ error: 'Submit a valid roadmap request.' }, { status: 400 })
  }
  const reader = request.body?.getReader()
  if (!reader) return NextResponse.json({ error: 'Submit a valid roadmap request.' }, { status: 400 })
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
    return NextResponse.json({ error: 'Submit a valid roadmap request.' }, { status: 400 })
  }

  let formData: FormData
  try {
    formData = await new Response(Buffer.concat(chunks) as BodyInit, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return NextResponse.json({ error: 'Submit a valid roadmap request.' }, { status: 400 })
  }
  const targetRole = formData.get('targetRole')
  if (typeof targetRole !== 'string' || targetRole.trim().length < 2 || targetRole.trim().length > 120) {
    return NextResponse.json({ error: 'Enter a target role between 2 and 120 characters.' }, { status: 400 })
  }

  const fileValue = formData.get('resumeFile')
  let resumeBytes: Uint8Array | null = null
  if (fileValue !== null) {
    if (!(fileValue instanceof File) || fileValue.size === 0) return NextResponse.json({ error: 'Choose a valid PDF resume.' }, { status: 400 })
    if (fileValue.size > MAX_RESUME_BYTES) return NextResponse.json({ error: 'Resume must be 4 MB or smaller.' }, { status: 413 })
    if (fileValue.type !== 'application/pdf' || !fileValue.name.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'Only PDF resumes are supported.' }, { status: 400 })
    }
    const bytes = new Uint8Array(await fileValue.arrayBuffer())
    if (new TextDecoder().decode(bytes.subarray(0, PDF_SIGNATURE.length)) !== PDF_SIGNATURE) {
      return NextResponse.json({ error: 'The selected file is not a valid PDF.' }, { status: 400 })
    }
    resumeBytes = bytes
  }

  const profileSkills = Array.isArray(profile.skills) ? profile.skills.filter((skill): skill is string => typeof skill === 'string').slice(0, 80) : []
  const profileContext = {
    headline: profile.headline,
    branch: profile.branch,
    interests: Array.isArray(profile.interests) ? profile.interests.filter((interest): interest is string => typeof interest === 'string').slice(0, 20) : [],
    skills: profileSkills,
  }
  const prompt = [
    'Create a practical, educational career learning roadmap for the target role below.',
    'Use only the supplied profile context and, if attached, the resume PDF to personalize the plan. Do not infer protected traits, seniority, or experience not explicitly stated.',
    'When a PDF is attached, list only career-relevant skills explicitly supported by the document in resumeSkills. Ignore contact details and personal identifiers.',
    'Return 6 to 10 concise target skills, a neutral 2-3 sentence role summary, and 4 to 6 ordered milestones.',
    'Make milestones actionable and progressive: each must have a learning objective, a concrete practice activity, and a realistic estimated hour count.',
    'Focus early milestones on the largest gaps, and include at least one portfolio or applied practice milestone.',
    'Do not claim the user is qualified, promise employment, or present the match as a hiring probability.',
    `Target role: ${targetRole.trim()}`,
    `Profile context: ${JSON.stringify(profileContext)}`,
    resumeBytes ? 'A resume PDF is attached as a file part.' : 'No resume was attached; return an empty resumeSkills array.',
  ].join('\n\n')

  try {
    const result = await generateText({
      model: 'google/gemini-3.5-flash',
      output: Output.object({ schema: generatedRoadmapSchema }),
      abortSignal: AbortSignal.timeout(45_000),
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: prompt },
          ...(resumeBytes ? [{ type: 'file' as const, mediaType: 'application/pdf' as const, data: resumeBytes }] : []),
        ],
      }],
    })
    if (!result.output) throw new Error('The model did not return a roadmap.')

    const resumeSkills = [...new Map(result.output.resumeSkills.map((skill) => [skill.trim().toLocaleLowerCase(), skill.trim()])).values()]
    const availableSkills = [...new Map([...profileSkills, ...resumeSkills].map((skill) => [skill.trim().toLocaleLowerCase(), skill.trim()])).values()].slice(0, 80)
    const targetSkills = [...new Map(result.output.targetSkills.map((skill) => [skill.trim().toLocaleLowerCase(), skill.trim()])).values()].slice(0, 12)
    const fit = explainSkillFit(availableSkills, targetSkills)
    const id = crypto.randomUUID()
    const milestones = result.output.milestones.map((milestone, index) => ({ ...milestone, id: `milestone-${index + 1}` }))
    const [row] = await db.insert(careerRoadmaps).values({
      id,
      userId: session.user.id,
      targetRole: targetRole.trim(),
      targetSkills,
      matchedSkills: fit.matched,
      missingSkills: fit.missing,
      matchScore: fit.score ?? 0,
      roleSummary: result.output.roleSummary,
      milestones,
      sourceResumeId: null,
      completedMilestones: [],
    }).returning()

    return NextResponse.json({
      roadmap: serializeCareerRoadmap({
        id: row.id,
        targetRole: row.targetRole,
        targetSkills: row.targetSkills,
        matchedSkills: row.matchedSkills,
        missingSkills: row.missingSkills,
        matchScore: row.matchScore,
        roleSummary: row.roleSummary,
        milestones: row.milestones,
        sourceResumeId: row.sourceResumeId,
        completedMilestones: row.completedMilestones,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }),
      notice: resumeBytes
        ? 'Your PDF was analyzed for this roadmap and was not stored by Pathway.'
        : 'No PDF was selected; the match uses skills from your profile.',
    }, { status: 201, headers: { 'Cache-Control': 'private, no-store' } })
  } catch (error) {
    console.error('Career roadmap generation failed.', error)
    return NextResponse.json({ error: 'The roadmap generator is temporarily unavailable. Please try again.' }, { status: 502 })
  }
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, POST' } })
}

export async function PATCH() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, POST' } })
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed.' }, { status: 405, headers: { Allow: 'GET, POST' } })
}

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: { Allow: 'GET, POST, OPTIONS' } })
}

export async function HEAD() {
  return new NextResponse(null, { status: 405, headers: { Allow: 'GET, POST' } })
}
