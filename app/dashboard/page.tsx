import { count, desc, eq } from 'drizzle-orm'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { PortalDashboard } from '@/components/portal-dashboard'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { applications, auditLogs, careerRoadmaps, facultyStudentAssignments, internships, mlModelRegistry, portalProfiles, resumeMetadata, user as users } from '@/lib/db/schema'
import { modelServiceCapabilities, recommendInternships } from '@/lib/ml-services/contracts'
import { serializeCareerRoadmap } from '@/lib/portal/roadmap-types'

export const dynamic = 'force-dynamic'

export const metadata = { title: 'Workspace | Pathway' }

export default async function DashboardPage() {
  const session = await auth.api.getSession({ headers: await headers() })
  if (!session?.user) redirect('/sign-in')

  await db.insert(portalProfiles).values({ userId: session.user.id, role: 'student' }).onConflictDoNothing()
  const [profile] = await db.select().from(portalProfiles).where(eq(portalProfiles.userId, session.user.id)).limit(1)
  if (!profile) throw new Error('Unable to load your workspace.')

  const [listings, userApplications, recruiterListings, modelRows, resumes, recruiterApplications, reviewListings, facultyStudents, facultyApplicationCounts, adminAssignments, adminUsers, adminAudit] = await Promise.all([
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
    profile.role === 'company_recruiter'
      ? db.select({ id: applications.id, status: applications.status, createdAt: applications.createdAt, title: internships.title, companyName: internships.companyName, applicantName: users.name, headline: portalProfiles.headline, branch: portalProfiles.branch, graduationYear: portalProfiles.graduationYear, skills: portalProfiles.skills })
          .from(applications)
          .innerJoin(internships, eq(applications.internshipId, internships.id))
          .innerJoin(users, eq(applications.userId, users.id))
          .leftJoin(portalProfiles, eq(applications.userId, portalProfiles.userId))
          .where(eq(internships.ownerUserId, session.user.id))
          .orderBy(desc(applications.createdAt)).limit(100)
      : Promise.resolve([]),
    profile.role === 'placement_officer'
      ? db.select().from(internships).where(eq(internships.status, 'pending_review')).orderBy(desc(internships.createdAt)).limit(100)
      : Promise.resolve([]),
    profile.role === 'faculty'
      ? db.select({ id: users.id, name: users.name, email: users.email, headline: portalProfiles.headline, institution: portalProfiles.institution, graduationYear: portalProfiles.graduationYear, branch: portalProfiles.branch, cgpa: portalProfiles.cgpa, skills: portalProfiles.skills })
          .from(facultyStudentAssignments)
          .innerJoin(users, eq(facultyStudentAssignments.studentUserId, users.id))
          .innerJoin(portalProfiles, eq(facultyStudentAssignments.studentUserId, portalProfiles.userId))
          .where(eq(facultyStudentAssignments.facultyUserId, session.user.id))
          .orderBy(users.name).limit(100)
      : Promise.resolve([]),
    profile.role === 'faculty'
      ? db.select({ studentUserId: applications.userId, applicationCount: count() })
          .from(applications)
          .innerJoin(facultyStudentAssignments, eq(applications.userId, facultyStudentAssignments.studentUserId))
          .where(eq(facultyStudentAssignments.facultyUserId, session.user.id))
          .groupBy(applications.userId)
      : Promise.resolve([]),
    profile.role === 'administrator'
      ? db.select({ facultyUserId: facultyStudentAssignments.facultyUserId, studentUserId: facultyStudentAssignments.studentUserId })
          .from(facultyStudentAssignments).orderBy(desc(facultyStudentAssignments.createdAt)).limit(500)
      : Promise.resolve([]),
    profile.role === 'administrator'
      ? db.select({ id: users.id, name: users.name, email: users.email, createdAt: users.createdAt, role: portalProfiles.role })
          .from(users).leftJoin(portalProfiles, eq(users.id, portalProfiles.userId)).orderBy(desc(users.createdAt)).limit(200)
      : Promise.resolve([]),
    profile.role === 'administrator'
      ? db.select({ id: auditLogs.id, action: auditLogs.action, resourceType: auditLogs.resourceType, resourceId: auditLogs.resourceId, metadata: auditLogs.metadata, createdAt: auditLogs.createdAt, actorName: users.name })
          .from(auditLogs).leftJoin(users, eq(auditLogs.actorUserId, users.id)).orderBy(desc(auditLogs.createdAt)).limit(100)
      : Promise.resolve([]),
  ])

  const roadmaps = profile.role === 'student'
    ? await db.select().from(careerRoadmaps).where(eq(careerRoadmaps.userId, session.user.id)).orderBy(desc(careerRoadmaps.updatedAt)).limit(20)
    : []

  const recommendations = profile.role === 'student'
    ? recommendInternships(
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
        new Set(userApplications.map(({ application }) => application.internshipId)),
      ).recommendations
    : []

  return <PortalDashboard
    recommendations={recommendations}
    modelServiceCapabilities={modelServiceCapabilities}
    user={{ id: session.user.id, name: session.user.name, email: session.user.email }}
    profile={{ role: profile.role, headline: profile.headline, institution: profile.institution, graduationYear: profile.graduationYear, branch: profile.branch, cgpa: profile.cgpa, skills: profile.skills, interests: profile.interests }}
    listings={listings.map((listing) => ({ ...listing, deadline: listing.deadline ? String(listing.deadline) : null, createdAt: listing.createdAt.toISOString(), updatedAt: listing.updatedAt.toISOString() }))}
    applications={userApplications.map(({ application, listing }) => ({ id: application.id, status: application.status, createdAt: application.createdAt.toISOString(), internshipId: listing.id, title: listing.title, companyName: listing.companyName }))}
    recruiterListings={recruiterListings.map((listing) => ({ id: listing.id, title: listing.title, companyName: listing.companyName, status: listing.status, deadline: listing.deadline ? String(listing.deadline) : null }))}
    recruiterApplications={recruiterApplications.map((application) => ({ ...application, skills: application.skills ?? [], createdAt: application.createdAt.toISOString() }))}
    reviewListings={reviewListings.map((listing) => ({ id: listing.id, title: listing.title, companyName: listing.companyName, location: listing.location, workMode: listing.workMode, description: listing.description, requiredSkills: listing.requiredSkills, deadline: listing.deadline ? String(listing.deadline) : null, submittedAt: listing.createdAt.toISOString() }))}
    facultyStudents={facultyStudents.map((student) => ({ ...student, cgpa: student.cgpa === null ? null : Number(student.cgpa), skills: student.skills ?? [], applicationCount: facultyApplicationCounts.find((entry) => entry.studentUserId === student.id)?.applicationCount ?? 0 }))}
    adminAssignments={adminAssignments}
    adminUsers={adminUsers.map((entry) => ({ ...entry, role: entry.role ?? 'student', createdAt: entry.createdAt.toISOString() }))}
    adminAudit={adminAudit.map((entry) => ({ ...entry, createdAt: entry.createdAt.toISOString() }))}
    modelRows={modelRows.map((model) => ({ id: model.id, modelName: model.modelName, task: model.task, version: model.version, trainingStatus: model.trainingStatus, approvalStatus: model.approvalStatus, deploymentStatus: model.deploymentStatus, evaluationMetrics: model.evaluationMetrics && typeof model.evaluationMetrics === 'object' && !Array.isArray(model.evaluationMetrics) ? model.evaluationMetrics as Record<string, unknown> : {} }))}
    resumes={resumes.map((resume) => ({ ...resume, createdAt: resume.createdAt.toISOString() }))}
    roadmaps={roadmaps.map((row) => serializeCareerRoadmap({ id: row.id, targetRole: row.targetRole, targetSkills: row.targetSkills, matchedSkills: row.matchedSkills, missingSkills: row.missingSkills, matchScore: row.matchScore, roleSummary: row.roleSummary, milestones: row.milestones, sourceResumeId: row.sourceResumeId, completedMilestones: row.completedMilestones, createdAt: row.createdAt, updatedAt: row.updatedAt }))}
  />
}
