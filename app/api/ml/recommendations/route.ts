import { desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { applications, internships, portalProfiles } from '@/lib/db/schema'
import { recommendInternships } from '@/lib/ml-services/contracts'

export const runtime = 'nodejs'

export async function GET() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) return NextResponse.json({ error: 'Sign in to view recommendations.' }, { status: 401 })

  const [profile] = await db.select().from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (!profile) return NextResponse.json({ error: 'Your student profile is not available.' }, { status: 404 })
  if (profile.role !== 'student') return NextResponse.json({ error: 'Recommendations are available to student accounts only.' }, { status: 403 })

  const [listings, submittedApplications] = await Promise.all([
    db.select().from(internships)
      .where(eq(internships.status, 'published'))
      .orderBy(desc(internships.createdAt))
      .limit(100),
    db.select({ internshipId: applications.internshipId })
      .from(applications)
      .where(eq(applications.userId, session.user.id)),
  ])

  const result = recommendInternships(
    {
      skills: profile.skills ?? [],
      interests: profile.interests ?? [],
      branch: profile.branch,
      graduationYear: profile.graduationYear,
      cgpa: profile.cgpa === null ? null : Number(profile.cgpa),
    },
    listings.map((listing) => ({
      id: listing.id,
      title: listing.title,
      companyName: listing.companyName,
      location: listing.location,
      workMode: listing.workMode,
      description: listing.description,
      requiredSkills: listing.requiredSkills ?? [],
      eligibility: listing.eligibility ?? {},
      deadline: listing.deadline ? String(listing.deadline) : null,
    })),
    new Set(submittedApplications.map((application) => application.internshipId)),
  )

  return NextResponse.json(result, {
    headers: { 'Cache-Control': 'private, no-store, max-age=0' },
  })
}
