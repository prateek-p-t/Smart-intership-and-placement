import { and, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PortalDashboard } from '@/components/portal-dashboard'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { applications, internships, mlModelRegistry, portalProfiles, resumeMetadata } from '@/lib/db/schema'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Workspace | Pathway' }

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  await db.insert(portalProfiles).values({ userId: session.user.id, role: 'student' }).onConflictDoNothing()
  const [profile] = await db.select().from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (!profile) throw new Error('Unable to load your workspace.')

  const [listings, userApplications, recruiterListings, modelRows, resumes] = await Promise.all([
    profile.role === 'student'
      ? db.select().from(internships).where(eq(internships.status, 'published')).orderBy(desc(internships.createdAt)).limit(30)
      : Promise.resolve([]),
    profile.role === 'student'
      ? db.select({ application: applications, listing: internships })
          .from(applications)
          .innerJoin(internships, eq(applications.internshipId, internships.id))
          .where(eq(applications.userId, session.user.id))
          .orderBy(desc(applications.createdAt)).limit(20)
      : Promise.resolve([]),
    profile.role === 'company_recruiter'
      ? db.select().from(internships).where(eq(internships.ownerUserId, session.user.id)).orderBy(desc(internships.createdAt)).limit(30)
      : Promise.resolve([]),
    profile.role === 'administrator'
      ? db.select().from(mlModelRegistry).orderBy(mlModelRegistry.task).limit(30)
      : Promise.resolve([]),
    profile.role === 'student'
      ? db.select({ id: resumeMetadata.id, originalName: resumeMetadata.originalName, byteSize: resumeMetadata.byteSize, createdAt: resumeMetadata.createdAt }).from(resumeMetadata).where(eq(resumeMetadata.userId, session.user.id)).orderBy(desc(resumeMetadata.createdAt)).limit(10)
      : Promise.resolve([]),
  ])

  return <PortalDashboard
    user={{ id: session.user.id, name: session.user.name, email: session.user.email }}
    profile={{ role: profile.role, headline: profile.headline, institution: profile.institution, graduationYear: profile.graduationYear, branch: profile.branch, cgpa: profile.cgpa, skills: profile.skills, interests: profile.interests }}
    listings={listings.map((listing) => ({ ...listing, deadline: listing.deadline ? String(listing.deadline) : null, createdAt: listing.createdAt.toISOString(), updatedAt: listing.updatedAt.toISOString() }))}
    applications={userApplications.map(({ application, listing }) => ({ id: application.id, status: application.status, createdAt: application.createdAt.toISOString(), internshipId: listing.id, title: listing.title, companyName: listing.companyName }))}
    recruiterListings={recruiterListings.map((listing) => ({ id: listing.id, title: listing.title, companyName: listing.companyName, status: listing.status, deadline: listing.deadline ? String(listing.deadline) : null }))}
    modelRows={modelRows.map((model) => ({ id: model.id, modelName: model.modelName, task: model.task, version: model.version, trainingStatus: model.trainingStatus, approvalStatus: model.approvalStatus, deploymentStatus: model.deploymentStatus, evaluationMetrics: model.evaluationMetrics && typeof model.evaluationMetrics === 'object' && !Array.isArray(model.evaluationMetrics) ? model.evaluationMetrics as Record<string, unknown> : {} }))}
    resumes={resumes.map((resume) => ({ ...resume, createdAt: resume.createdAt.toISOString() }))}
  />
}
