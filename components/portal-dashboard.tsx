'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight, Bell, BriefcaseBusiness, Building2, Check, ChevronRight, CircleHelp, Compass, Download, FileCheck2, FileText, GraduationCap, LayoutDashboard, LoaderCircle, LogOut, MapPin, Plus, ShieldCheck, Sparkles, Trash2, Upload, UserRound, Users, WandSparkles } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { checkEligibility, displayRole, explainSkillFit, initials } from '@/lib/portal/logic'
import type { InternshipRecommendation, ServiceCapability } from '@/lib/ml-services/contracts'

type Listing = {
  id: string
  title: string
  companyName: string
  location: string
  workMode: string
  stipendMin: number | null
  stipendMax: number | null
  description: string
  requiredSkills: string[]
  eligibility: { minCgpa?: number; branches?: string[]; graduationYears?: number[] }
  status: string
  deadline: string | null
}
type Profile = { role: string; headline: string | null; institution: string | null; graduationYear: number | null; branch: string | null; cgpa: string | null; skills: string[]; interests: string[] }
type Application = { id: string; status: string; createdAt: string; internshipId: string; title: string; companyName: string }
type RecruiterListing = { id: string; title: string; companyName: string; status: string; deadline: string | null }
type RecruiterApplication = { id: string; status: string; createdAt: string; title: string; companyName: string; applicantName: string; headline: string | null; branch: string | null; graduationYear: number | null; skills: string[] }
type ReviewListing = { id: string; title: string; companyName: string; location: string; workMode: string; description: string; requiredSkills: string[]; deadline: string | null; submittedAt: string }
type AdminUser = { id: string; name: string; email: string; createdAt: string; role: string }
type FacultyStudent = { id: string; name: string; email: string; headline: string | null; institution: string | null; graduationYear: number | null; branch: string | null; cgpa: number | null; skills: string[]; applicationCount: number }
type FacultyAssignment = { facultyUserId: string; studentUserId: string }
type AuditEntry = { id: string; action: string; resourceType: string; resourceId: string | null; metadata: unknown; createdAt: string; actorName: string | null }
type ModelRow = { id: string; modelName: string; task: string; version: string; trainingStatus: string; approvalStatus: string; deploymentStatus: string; evaluationMetrics: Record<string, unknown> }
type Resume = { id: string; originalName: string; byteSize: number; createdAt: string }
type NavItem = { id: string; label: string; icon: typeof LayoutDashboard }

export function PortalDashboard({ user, profile: initialProfile, listings, applications, recruiterListings, recruiterApplications, reviewListings, facultyStudents, adminAssignments, adminUsers, adminAudit, modelRows, resumes: initialResumes, recommendations, modelServiceCapabilities }: {
  user: { id: string; name: string; email: string }; profile: Profile; listings: Listing[]; applications: Application[]; recruiterListings: RecruiterListing[]; recruiterApplications: RecruiterApplication[]; reviewListings: ReviewListing[]; facultyStudents: FacultyStudent[]; adminAssignments: FacultyAssignment[]; adminUsers: AdminUser[]; adminAudit: AuditEntry[]; modelRows: ModelRow[]; resumes: Resume[]; recommendations: InternshipRecommendation[]; modelServiceCapabilities: ServiceCapability[]
}) {
  const router = useRouter()
  const [profile, setProfile] = useState(initialProfile)
  const [resumes, setResumes] = useState(initialResumes)
  const [uploadingResume, setUploadingResume] = useState(false)
  const [deletingResumeId, setDeletingResumeId] = useState('')
  const [active, setActive] = useState('overview')
  const [appliedIds, setAppliedIds] = useState(() => new Set(applications.map((application) => application.internshipId)))
  const [pendingId, setPendingId] = useState('')
  const [notice, setNotice] = useState('')
  const [noticeError, setNoticeError] = useState(false)
  const showNotice = (message: string, isError = false) => { setNotice(message); setNoticeError(isError) }
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const [changingRoleId, setChangingRoleId] = useState('')
  const [assignmentPending, setAssignmentPending] = useState(false)
  const role = profile.role

  const navItems: NavItem[] = useMemo(() => {
    if (role === 'student') return [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'opportunities', label: 'Opportunities', icon: Compass },
      { id: 'applications', label: 'My applications', icon: FileCheck2 },
      { id: 'career-tools', label: 'Career tools', icon: WandSparkles },
      { id: 'resumes', label: 'Resume library', icon: FileText },
      { id: 'profile', label: 'My profile', icon: UserRound },
    ]
    if (role === 'company_recruiter') return [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'listings', label: 'My listings', icon: BriefcaseBusiness },
      { id: 'create-listing', label: 'Post opportunity', icon: Plus },
    ]
    if (role === 'faculty') return [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'students', label: 'Student progress', icon: GraduationCap },
      { id: 'reports', label: 'Academic reports', icon: Activity },
    ]
    if (role === 'placement_officer') return [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'review', label: 'Listing review', icon: FileCheck2 },
      { id: 'reports', label: 'Placement reports', icon: Activity },
    ]
    return [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'models', label: 'Model registry', icon: WandSparkles },
      { id: 'users', label: 'Role access', icon: Users },
      { id: 'audit', label: 'Audit activity', icon: ShieldCheck },
    ]
  }, [role])

  const filteredListings = listings.filter((listing) => `${listing.title} ${listing.companyName} ${listing.location} ${listing.requiredSkills.join(' ')}`.toLowerCase().includes(search.toLowerCase()))
  const roleLabel = displayRole(role)

  async function apply(listingId: string) {
    setPendingId(listingId)
    showNotice('')
    try {
      const response = await fetch('/api/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ internshipId: listingId }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to submit this application.')
      setAppliedIds((previous) => new Set(previous).add(listingId))
      showNotice('Your application has been submitted.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to submit this application.', true)
    } finally {
      setPendingId('')
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    showNotice('')
    try {
      const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        headline: formData.get('headline'), institution: formData.get('institution'), branch: formData.get('branch'), graduationYear: formData.get('graduationYear') || null, cgpa: formData.get('cgpa') || null,
        skills: String(formData.get('skills') ?? '').split(',').map((skill) => skill.trim()).filter(Boolean),
        interests: String(formData.get('interests') ?? '').split(',').map((interest) => interest.trim()).filter(Boolean),
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save your profile.')
      setProfile({ ...profile, ...result.profile })
      showNotice('Your profile has been saved.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to save your profile.', true)
    } finally {
      setSaving(false)
    }
  }

  async function uploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = new FormData(form).get('file')
    if (!(file instanceof File) || file.size === 0) {
      showNotice('Choose a PDF resume to upload.', true)
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      showNotice('Resume must be 4 MB or smaller.', true)
      return
    }
    setUploadingResume(true)
    showNotice('')
    try {
      const data = new FormData()
      data.append('file', file)
      const response = await fetch('/api/resumes', { method: 'POST', body: data })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload this resume.')
      setResumes((previous) => [result.resume as Resume, ...previous].slice(0, 10))
      form.reset()
      showNotice('Your resume has been uploaded securely.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to upload this resume.', true)
    } finally {
      setUploadingResume(false)
    }
  }

  async function deleteResume(id: string) {
    setDeletingResumeId(id)
    showNotice('')
    try {
      const response = await fetch('/api/resumes', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to delete this resume.')
      setResumes((previous) => previous.filter((resume) => resume.id !== id))
      showNotice('Your resume has been deleted.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to delete this resume.', true)
    } finally {
      setDeletingResumeId('')
    }
  }

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    showNotice('')
    try {
      const response = await fetch('/api/internships', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        title: data.get('title'), companyName: data.get('companyName'), location: data.get('location'), description: data.get('description'), workMode: data.get('workMode'), requiredSkills: String(data.get('requiredSkills') ?? '').split(',').map((skill) => skill.trim()).filter(Boolean), deadline: data.get('deadline') || null,
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to submit this listing.')
      form.reset()
      showNotice('Opportunity submitted for placement-office review.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to submit this listing.', true)
    } finally {
      setSaving(false)
    }
  }

  async function reviewListing(listingId: string, decision: 'publish' | 'reject') {
    setPendingId(listingId)
    showNotice('')
    try {
      const response = await fetch('/api/placement/listings', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ listingId, decision }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to update this listing.')
      showNotice(decision === 'publish' ? 'Listing approved and published.' : 'Listing rejected.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to update this listing.', true)
    } finally {
      setPendingId('')
    }
  }

  async function updateApplicationStage(applicationId: string, status: string) {
    setPendingId(applicationId)
    showNotice('')
    try {
      const response = await fetch(`/api/applications/${encodeURIComponent(applicationId)}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to update this application.')
      showNotice('Application stage updated.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to update this application.', true)
    } finally {
      setPendingId('')
    }
  }

  async function changeRole(targetUserId: string, nextRole: string) {
    setChangingRoleId(targetUserId)
    showNotice('')
    try {
      const response = await fetch('/api/admin/users', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: targetUserId, role: nextRole }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to update this role.')
      showNotice('Account role updated.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to update this role.', true)
    } finally {
      setChangingRoleId('')
    }
  }

  async function saveFacultyAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setAssignmentPending(true)
    showNotice('')
    try {
      const response = await fetch('/api/admin/faculty-assignments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyUserId: data.get('facultyUserId'), studentUserId: data.get('studentUserId') }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to assign this student.')
      form.reset()
      showNotice('Student assigned to faculty member.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to assign this student.', true)
    } finally {
      setAssignmentPending(false)
    }
  }

  async function removeFacultyAssignment(facultyUserId: string, studentUserId: string) {
    setAssignmentPending(true)
    showNotice('')
    try {
      const response = await fetch('/api/admin/faculty-assignments', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ facultyUserId, studentUserId }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to remove this assignment.')
      showNotice('Faculty assignment removed.')
      router.refresh()
    } catch (error) {
      showNotice(error instanceof Error ? error.message : 'Unable to remove this assignment.', true)
    } finally {
      setAssignmentPending(false)
    }
  }

  async function handleSignOut() {
    await signOut()
    router.replace('/sign-in')
    router.refresh()
  }

  return (
    <main className="dashboard-shell">
      <aside className="dashboard-sidebar">
        <a href="/" className="dash-brand"><span className="brand-mark"><BriefcaseBusiness size={16} /></span><span>pathway<span className="brand-period">.</span></span></a>
        <div className="sidebar-section-label">WORKSPACE</div>
        <nav className="dashboard-nav" aria-label="Workspace navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-label={label} title={label} aria-current={active === id ? 'page' : undefined} onClick={() => { setActive(id); showNotice('') }}><Icon size={16} /><span>{label}</span></button>)}</nav>
        <div className="dashboard-sidebar-foot"><span className="role-chip">{roleLabel.toUpperCase()}</span><span>Access follows your assigned role.</span></div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar"><button type="button" className="icon-button" aria-label="Notifications"><Bell size={15} /></button><div className="signed-in-user"><span className="user-avatar">{initials(user.name)}</span><span>{user.name}</span></div><button className="signout-button" type="button" onClick={handleSignOut}>Sign out</button></header>
        <div className="dashboard-content">
          <div className="dashboard-welcome"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR {roleLabel.toUpperCase()} WORKSPACE</div><h1>{active === 'overview' ? `Good to see you, ${user.name.split(' ')[0]}.` : navItems.find((item) => item.id === active)?.label}</h1><p>{active === 'overview' ? role === 'student' ? 'Your next opportunity starts with a clear view of what fits.' : `Your ${roleLabel.toLowerCase()} tools and authorized records, all in one place.` : 'Explore the information and tools available to your account.'}</p></div>{role === 'student' && <div className="profile-row"><span>PROFILE DETAILS</span><span><i style={{ width: `${profileCompleteness(profile)}%` }} /></span><strong>{profileCompleteness(profile)}%</strong></div>}</div>
          {notice && <div className={noticeError ? 'form-error' : 'profile-success'} role={noticeError ? 'alert' : 'status'}>{notice}</div>}
          {role === 'student' && <StudentContent active={active} profile={profile} listings={filteredListings} applications={applications} appliedIds={appliedIds} pendingId={pendingId} onApply={apply} search={search} onSearch={setSearch} onSaveProfile={saveProfile} saving={saving} resumes={resumes} onUploadResume={uploadResume} onDeleteResume={deleteResume} uploadingResume={uploadingResume} deletingResumeId={deletingResumeId} recommendations={recommendations} onNavigate={setActive} />}
          {role === 'company_recruiter' && <RecruiterContent active={active} listings={recruiterListings} applications={recruiterApplications} onCreate={createListing} onStageChange={updateApplicationStage} pendingId={pendingId} saving={saving} />}
          {role === 'faculty' && <FacultyContent active={active} students={facultyStudents} />}
          {role === 'placement_officer' && <PlacementContent active={active} listings={reviewListings} onDecision={reviewListing} pendingId={pendingId} />}
          {role === 'administrator' && <AdminContent active={active} models={modelRows} capabilities={modelServiceCapabilities} users={adminUsers} assignments={adminAssignments} audit={adminAudit} currentUserId={user.id} changingRoleId={changingRoleId} assignmentPending={assignmentPending} onRoleChange={changeRole} onAssign={saveFacultyAssignment} onUnassign={removeFacultyAssignment} />}
          <footer className="dashboard-footer"><span>Pathway · University career workspace</span><span>Eligibility uses published criteria. Recommendations are explainable, not decisions.</span></footer>
        </div>
      </section>
    </main>
  )
}

function profileCompleteness(profile: Profile) {
  const checks = [Boolean(profile.headline), Boolean(profile.institution), Boolean(profile.branch), Boolean(profile.graduationYear), Boolean(profile.cgpa), profile.skills.length > 0, profile.interests.length > 0]
  return Math.round((checks.filter(Boolean).length / checks.length) * 100)
}

function formatFileSize(bytes: number) {
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function StudentContent({ active, profile, listings, applications, appliedIds, pendingId, onApply, search, onSearch, onSaveProfile, saving, resumes, onUploadResume, onDeleteResume, uploadingResume, deletingResumeId, recommendations, onNavigate }: {
  active: string; profile: Profile; listings: Listing[]; applications: Application[]; appliedIds: Set<string>; pendingId: string; onApply: (id: string) => void; search: string; onSearch: (value: string) => void; onSaveProfile: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; resumes: Resume[]; onUploadResume: (event: FormEvent<HTMLFormElement>) => void; onDeleteResume: (id: string) => void; uploadingResume: boolean; deletingResumeId: string; recommendations: InternshipRecommendation[]; onNavigate: (section: string) => void
}) {
  const recommendationOrder = new Map(recommendations.map((recommendation, index) => [recommendation.id, index]))
  const rankedListings = [...listings].sort((a, b) => (recommendationOrder.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (recommendationOrder.get(b.id) ?? Number.MAX_SAFE_INTEGER))

  if (active === 'profile') return <section className="dashboard-section"><div className="section-heading"><div><h2>Your profile</h2><p>Add accurate details to make eligibility checks more useful.</p></div></div><form className="profile-form" onSubmit={onSaveProfile}>
    <label className="form-field"><span>Headline</span><input name="headline" defaultValue={profile.headline ?? ''} maxLength={160} placeholder="e.g. Computer science student" /></label>
    <label className="form-field"><span>Institution</span><input name="institution" defaultValue={profile.institution ?? ''} maxLength={160} placeholder="University or college" /></label>
    <label className="form-field"><span>Degree branch</span><input name="branch" defaultValue={profile.branch ?? ''} maxLength={100} placeholder="e.g. Computer Science" /></label>
    <label className="form-field"><span>Graduation year</span><input name="graduationYear" type="number" min="2000" max="2100" defaultValue={profile.graduationYear ?? ''} /></label>
    <label className="form-field"><span>CGPA (0–10)</span><input name="cgpa" type="number" min="0" max="10" step="0.01" defaultValue={profile.cgpa ?? ''} /></label>
    <label className="form-field"><span>Skills, comma separated</span><input name="skills" defaultValue={profile.skills.join(', ')} maxLength={1200} placeholder="Python, SQL, Figma" /></label>
    <label className="form-field full-field"><span>Career interests, comma separated</span><input name="interests" defaultValue={profile.interests.join(', ')} maxLength={800} placeholder="Product design, data analytics" /></label>
    <div className="profile-form-actions"><button className="button button-dark" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save profile'}</button>{saving && <LoaderCircle className="spin" size={16} />}</div>
  </form></section>

  if (active === 'resumes') return <ResumeLibrary resumes={resumes} onUploadResume={onUploadResume} onDeleteResume={onDeleteResume} uploadingResume={uploadingResume} deletingResumeId={deletingResumeId} />

  if (active === 'career-tools') return <CareerTools profile={profile} listings={listings} />

  if (active === 'applications') return <section className="dashboard-section"><div className="section-heading"><div><h2>Application history</h2><p>Only applications created by your account are shown here.</p></div><span className="role-chip">{applications.length} TOTAL</span></div>{applications.length ? <div className="application-list">{applications.map((application) => <div key={application.id} className="application-row"><div><strong>{application.title}</strong><p>{application.companyName} · Submitted {new Date(application.createdAt).toLocaleDateString()}</p></div><span className="status-pill">{application.status.replaceAll('_', ' ')}</span></div>)}</div> : <div className="empty-state"><strong>No applications yet</strong><p>When you apply to an opportunity, its current stage will show up here.</p></div>}</section>

  if (active === 'opportunities') return <section className="dashboard-section"><div className="section-heading"><div><h2>Open opportunities</h2><p>Ranked with transparent skill and interest rules; eligibility is not a hiring decision.</p></div><label className="search-field"><Compass size={14} /><input aria-label="Search opportunities" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search roles, skills, places" /></label></div><ListingList listings={rankedListings} profile={profile} appliedIds={appliedIds} pendingId={pendingId} onApply={onApply} recommendations={recommendations} /></section>

  return <>
    <div className="dashboard-summary"><div className="summary-card"><span>Published opportunities</span><strong>{listings.length}</strong><small>Open in your workspace</small></div><div className="summary-card"><span>Your applications</span><strong>{applications.length}</strong><small>Scoped to your account</small></div><div className="summary-card"><span>Profile details</span><strong>{profileCompleteness(profile)}%</strong><small>Based on fields completed</small></div></div>
    <div className="student-quick-links" aria-label="Quick access"><button type="button" onClick={() => onNavigate('career-tools')}><WandSparkles size={15} /> Career tools</button><button type="button" onClick={() => onNavigate('resumes')}><FileText size={15} /> Resume library</button><button type="button" onClick={() => onNavigate('profile')}><UserRound size={15} /> Complete profile</button></div>
    <section className="dashboard-section"><div className="section-heading"><div><h2>Opportunities to explore</h2><p>Explainable skill and interest matches. This is not a trained model or hiring prediction.</p></div><button className="inline-action" type="button" onClick={() => onNavigate('opportunities')}>View all <ChevronRight size={14} /></button></div><ListingList listings={rankedListings.slice(0, 5)} profile={profile} appliedIds={appliedIds} pendingId={pendingId} onApply={onApply} recommendations={recommendations} /></section>
    <section className="dashboard-section"><div className="section-heading"><div><h2>Recent applications</h2><p>Your latest updates, visible only to you.</p></div></div>{applications.length ? <div className="application-list">{applications.slice(0, 4).map((application) => <div key={application.id} className="application-row"><div><strong>{application.title}</strong><p>{application.companyName}</p></div><span className="status-pill">{application.status.replaceAll('_', ' ')}</span></div>)}</div> : <div className="empty-state"><strong>Your application activity will show here</strong><p>Start with a published opportunity that fits your interests.</p></div>}</section>
  </>
}

function ResumeLibrary({ resumes, onUploadResume, onDeleteResume, uploadingResume, deletingResumeId }: { resumes: Resume[]; onUploadResume: (event: FormEvent<HTMLFormElement>) => void; onDeleteResume: (id: string) => void; uploadingResume: boolean; deletingResumeId: string }) {
  return <section className="dashboard-section"><div className="section-heading"><div><h2>Resume library</h2><p>Private PDFs are visible only to your account. Maximum file size: 4 MB.</p></div><span className="role-chip">{resumes.length} SAVED</span></div><form className="resume-upload" onSubmit={onUploadResume}><label className="form-field"><span>Choose a PDF resume</span><input name="file" type="file" accept="application/pdf,.pdf" required /></label><button className="button button-dark" type="submit" disabled={uploadingResume}>{uploadingResume ? <><LoaderCircle className="spin" size={15} /> Uploading…</> : <><Upload size={15} /> Upload resume</>}</button></form>{resumes.length ? <ul className="resume-list">{resumes.map((resume) => <li className="resume-row" key={resume.id}><span className="resume-file-icon"><FileText size={17} /></span><div className="resume-file-details"><strong>{resume.originalName}</strong><span>{formatFileSize(resume.byteSize)} · Uploaded <time dateTime={resume.createdAt}>{new Date(resume.createdAt).toLocaleDateString()}</time></span></div><a className="resume-action" href={`/api/resumes/${encodeURIComponent(resume.id)}`} aria-label={`Download ${resume.originalName}`}><Download size={15} /><span>Download</span></a><button className="resume-action resume-delete" type="button" disabled={deletingResumeId === resume.id} aria-label={`Delete ${resume.originalName}`} onClick={() => { if (window.confirm(`Delete ${resume.originalName}?`)) onDeleteResume(resume.id) }}>{deletingResumeId === resume.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}<span>Delete</span></button></li>)}</ul> : <div className="empty-state"><strong>No resumes uploaded</strong><p>Upload a PDF to keep a private copy in your workspace.</p></div>}</section>
}

function CareerTools({ profile, listings }: { profile: Profile; listings: Listing[] }) {
  const [selectedListingId, setSelectedListingId] = useState(listings[0]?.id ?? '')
  const [manualRequiredSkills, setManualRequiredSkills] = useState('')
  const [practiceRole, setPracticeRole] = useState(profile.headline ?? '')
  const [difficulty, setDifficulty] = useState<'entry' | 'intermediate' | 'advanced'>('entry')
  const [answers, setAnswers] = useState<Record<number, string>>({})
  const selectedListing = listings.find((listing) => listing.id === selectedListingId) ?? listings[0]
  const requiredSkills = selectedListing?.requiredSkills ?? manualRequiredSkills.split(',').map((skill) => skill.trim()).filter(Boolean)
  const fit = explainSkillFit(profile.skills, requiredSkills)
  const focusSkill = fit.missing[0] ?? profile.skills[0] ?? 'your strongest skill'
  const interviewRole = selectedListing?.title ?? practiceRole.trim()
  const level = difficulty === 'entry' ? 'starting out' : difficulty === 'intermediate' ? 'building experience' : 'working at an advanced level'
  const prompts = interviewRole ? [
    `Tell me how you would use ${focusSkill} in a project related to ${interviewRole}. ${difficulty === 'entry' ? 'A class or personal project is a good example.' : difficulty === 'intermediate' ? 'Include the trade-offs you considered.' : 'Explain the constraints and measurable impact.'}`,
    `Describe a challenge you might face while working as a ${interviewRole}, and how you would approach it.`,
    `What would you like to learn next to be more effective in this role?`,
  ] : []

  return <>
    <section className="career-tools-intro"><div><span className="eyebrow"><span className="eyebrow-dot" /> PRACTICE, THEN PROGRESS</span><h2>Career tools</h2><p>Use published role requirements to spot skill gaps and practice interview answers. These transparent tools do not score or make hiring decisions.</p></div></section>
    <div className="career-tools-grid">
      <section className="career-tool-card"><div className="career-tool-heading"><div><span className="tool-kicker">SKILL GAP ANALYSIS</span><h3>Choose a role to explore</h3></div><WandSparkles size={18} /></div>
        {listings.length ? <label className="form-field"><span>Published opportunity</span><select value={selectedListingId} onChange={(event) => setSelectedListingId(event.target.value)}>{listings.map((listing) => <option key={listing.id} value={listing.id}>{listing.title} · {listing.companyName}</option>)}</select></label> : <div className="manual-role-fields"><label className="form-field"><span>Role title</span><input value={practiceRole} maxLength={120} onChange={(event) => setPracticeRole(event.target.value)} placeholder="e.g. Frontend developer" /></label><label className="form-field"><span>Target skills, comma separated</span><input value={manualRequiredSkills} maxLength={800} onChange={(event) => setManualRequiredSkills(event.target.value)} placeholder="React, TypeScript, accessibility" /></label></div>}
        {requiredSkills.length ? <><div className="tool-skill-lists"><div><strong>Skills in your profile <span>{fit.matched.length}</span></strong>{fit.matched.length ? <div className="skill-list">{fit.matched.map((skill) => <span className="skill-chip" key={skill}>{skill}</span>)}</div> : <p>Add skills to your profile to see matches.</p>}</div><div><strong>Skills to build <span>{fit.missing.length}</span></strong>{fit.missing.length ? <div className="skill-list">{fit.missing.map((skill) => <span className="skill-chip skill-chip-missing" key={skill}>{skill}</span>)}</div> : <p>All target skills appear in your profile.</p>}</div></div><p className="tool-disclaimer">Compared against {selectedListing ? 'this opportunity’s published requirements' : 'the target skills you entered'}. Profile skills are not independently verified.</p></> : <div className="empty-state"><strong>Add target skills to compare</strong><p>Enter a comma-separated skill list or choose a role with published requirements.</p></div>}
      </section>
      <section className="career-tool-card"><div className="career-tool-heading"><div><span className="tool-kicker">INTERVIEW PRACTICE</span><h3>Prepare with role-specific prompts</h3></div><Sparkles size={18} /></div>
        <label className="form-field"><span>Role to practice</span><input value={interviewRole} maxLength={120} disabled={Boolean(selectedListing)} onChange={(event) => setPracticeRole(event.target.value)} placeholder="e.g. Data analyst" /></label>
        {prompts.length ? <><p className="practice-role">{selectedListing ? <>Practice for <strong>{selectedListing.title}</strong> at {selectedListing.companyName}.</> : 'Practice using the role you entered.'} Prompts are tailored for someone {level}.</p><label className="form-field practice-level"><span>Prompt level</span><select value={difficulty} onChange={(event) => { setDifficulty(event.target.value as typeof difficulty); setAnswers({}) }}><option value="entry">Entry level</option><option value="intermediate">Intermediate</option><option value="advanced">Advanced</option></select></label><div className="practice-prompt-list">{prompts.map((prompt, index) => <label className="practice-prompt" key={`${interviewRole}-${difficulty}-${index}`}><span><strong>{index + 1}.</strong> {prompt}</span><textarea rows={3} maxLength={1600} value={answers[index] ?? ''} onChange={(event) => setAnswers((previous) => ({ ...previous, [index]: event.target.value }))} placeholder="Draft your answer here…" /></label>)}</div><div className="tool-disclaimer"><strong>Self-review checklist:</strong> include a specific example, explain your contribution, and describe what you learned. No answer is scored or sent for evaluation.</div></> : <div className="empty-state"><strong>Enter a role to begin</strong><p>Practice prompts will appear as soon as you name a target role.</p></div>}
      </section>
    </div>
  </>
}

function ListingList({ listings, profile, appliedIds, pendingId, onApply, recommendations = [] }: { listings: Listing[]; profile: Profile; appliedIds: Set<string>; pendingId: string; onApply: (id: string) => void; recommendations?: InternshipRecommendation[] }) {
  if (!listings.length) return <div className="empty-state"><strong>No published opportunities yet</strong><p>When a verified listing is published, it will appear here.</p></div>
  const recommendationById = new Map(recommendations.map((recommendation) => [recommendation.id, recommendation]))
  return <div className="job-list">{listings.map((listing) => {
    const match = explainSkillFit(profile.skills, listing.requiredSkills)
    const recommendation = recommendationById.get(listing.id)
    const eligibility = checkEligibility(profile, listing.eligibility)
    return <article className="job-card" key={listing.id}><div className="job-card-top"><div className="job-title-wrap"><span className="company-mark">{listing.companyName.slice(0, 1).toUpperCase()}</span><div><h3>{listing.title}</h3><p>{listing.companyName}</p></div></div>{match.score !== null && <span className="match-pill">{match.score}% skill overlap</span>}</div><div className="job-meta"><span><MapPin size={13} />{listing.location}</span><span><Building2 size={13} />{listing.workMode}</span><span>{eligibility.criteriaCount ? eligibility.eligible ? 'Meets listed criteria' : 'Criteria not met or profile incomplete' : 'No hard criteria listed'}</span>{listing.deadline && <span>Apply by {new Date(`${listing.deadline}T00:00:00`).toLocaleDateString()}</span>}</div>{listing.requiredSkills.length > 0 && <div className="skill-list" aria-label="Required skills">{listing.requiredSkills.slice(0, 6).map((skill) => <span className="skill-chip" key={skill}>{skill}{match.matched.includes(skill) ? ' · matched' : ''}</span>)}</div>}<p className="job-description">{listing.description}</p>{recommendation && <p className="recommendation-reason"><Sparkles size={13} /> Match signals: {recommendation.reasons.join(' ') || 'No matching skills or interests were listed.'}</p>}{!eligibility.eligible && eligibility.criteriaCount > 0 && <p className="eligibility-note">Review the posted criteria before applying. Missing profile information is not assumed to meet a requirement.</p>}<button className="apply-button" type="button" disabled={appliedIds.has(listing.id) || pendingId === listing.id} onClick={() => onApply(listing.id)}>{pendingId === listing.id ? 'Submitting…' : appliedIds.has(listing.id) ? 'Application submitted' : 'Apply for this role'}{pendingId !== listing.id && <ArrowRight size={13} />}</button></article>
  })}</div>
}

function RecruiterContent({ active, listings, applications, onCreate, onStageChange, pendingId, saving }: { active: string; listings: RecruiterListing[]; applications: RecruiterApplication[]; onCreate: (event: FormEvent<HTMLFormElement>) => void; onStageChange: (id: string, status: string) => void; pendingId: string; saving: boolean }) {
  if (active === 'create-listing') return <section className="dashboard-section"><div className="section-heading"><div><h2>Submit an opportunity</h2><p>New listings enter review and won&apos;t appear to students until approved.</p></div></div><form className="profile-form" onSubmit={onCreate}><label className="form-field"><span>Role title</span><input name="title" required maxLength={120} /></label><label className="form-field"><span>Company name</span><input name="companyName" required maxLength={120} /></label><label className="form-field"><span>Location</span><input name="location" required maxLength={160} /></label><label className="form-field"><span>Work mode</span><select name="workMode" defaultValue="Hybrid"><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label><label className="form-field"><span>Required skills</span><input name="requiredSkills" placeholder="Python, SQL, React" maxLength={800} /></label><label className="form-field"><span>Application deadline</span><input name="deadline" type="date" /></label><label className="form-field full-field"><span>Description</span><textarea name="description" required minLength={30} maxLength={3000} rows={5} /></label><div className="profile-form-actions"><button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit for review'}</button></div></form></section>
  return <><div className="dashboard-summary"><div className="summary-card"><span>Listings you own</span><strong>{listings.length}</strong><small>Restricted to your account</small></div><div className="summary-card"><span>Published</span><strong>{listings.filter((listing) => listing.status === 'published').length}</strong><small>Visible in the student marketplace</small></div><div className="summary-card"><span>Applications</span><strong>{applications.length}</strong><small>Only applications to your listings</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>{active === 'listings' ? 'Your listings' : 'Recruitment workspace'}</h2><p>Listings and status are scoped to your recruiter account.</p></div></div>{listings.length ? <div className="application-list">{listings.map((listing) => <div key={listing.id} className="application-row"><div><strong>{listing.title}</strong><p>{listing.companyName}{listing.deadline ? ` · Deadline ${listing.deadline}` : ''}</p></div><span className="status-pill">{listing.status.replaceAll('_', ' ')}</span></div>)}</div> : <div className="empty-state"><strong>No listings yet</strong><p>Submit a role and the placement office can review it for publication.</p></div>}</section><section className="dashboard-section"><div className="section-heading"><div><h2>Applicant pipeline</h2><p>Review applications for listings owned by your account. Resume files remain private to each student.</p></div></div>{applications.length ? <div className="application-list">{applications.map((application) => <div key={application.id} className="application-row applicant-row"><div><strong>{application.applicantName}</strong><p>{application.title} · {application.companyName}</p><span className="applicant-detail">{[application.headline, application.branch, application.graduationYear ? `Class of ${application.graduationYear}` : null, application.skills.slice(0, 5).join(', ') || null].filter(Boolean).join(' · ') || 'No profile details shared'}</span></div><label className="stage-control"><span className="sr-only">Update application stage for {application.applicantName}</span><select className="stage-select" value={application.status} disabled={Boolean(pendingId) || ['offered', 'rejected'].includes(application.status)} onChange={(event) => onStageChange(application.id, event.target.value)}><option value={application.status}>{application.status.replaceAll('_', ' ')}</option>{!['reviewing', 'interview', 'offered', 'rejected'].includes(application.status) && <option value="reviewing">reviewing</option>}{['reviewing', 'interview', 'offered', 'rejected'].map((stage) => stage !== application.status && <option key={stage} value={stage}>{stage}</option>)}</select></label></div>)}</div> : <div className="empty-state"><strong>No applications yet</strong><p>Applications to your published listings will appear here.</p></div>}</section></>
}

function FacultyContent({ active, students }: { active: string; students: FacultyStudent[] }) {
  const applicationTotal = students.reduce((total, student) => total + student.applicationCount, 0)
  const cohortSummary = new Map<string, { students: number; applications: number }>()
  for (const student of students) {
    const cohort = student.graduationYear ? String(student.graduationYear) : 'Year not listed'
    const summary = cohortSummary.get(cohort) ?? { students: 0, applications: 0 }
    summary.students += 1
    summary.applications += student.applicationCount
    cohortSummary.set(cohort, summary)
  }

  if (active === 'reports') return <><div className="dashboard-summary"><div className="summary-card"><span>Assigned students</span><strong>{students.length}</strong><small>Only your assigned students</small></div><div className="summary-card"><span>Applications submitted</span><strong>{applicationTotal}</strong><small>Across assigned students</small></div><div className="summary-card"><span>Graduation cohorts</span><strong>{cohortSummary.size}</strong><small>Based on student profiles</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>Academic reports</h2><p>Aggregate application activity for your assigned students only.</p></div></div>{cohortSummary.size ? <div className="application-list">{Array.from(cohortSummary, ([cohort, summary]) => <div className="application-row" key={cohort}><div><strong>{cohort === 'Year not listed' ? cohort : `Class of ${cohort}`}</strong><p>{summary.students} assigned {summary.students === 1 ? 'student' : 'students'}</p></div><span className="status-pill">{summary.applications} {summary.applications === 1 ? 'application' : 'applications'}</span></div>)}</div> : <div className="empty-state"><strong>No cohort report data yet</strong><p>Reports will appear after students are assigned to your faculty account.</p></div>}</section></>

  return <><div className="dashboard-summary"><div className="summary-card"><span>Assigned students</span><strong>{students.length}</strong><small>Scoped to your account</small></div><div className="summary-card"><span>Applications submitted</span><strong>{applicationTotal}</strong><small>Across your assigned students</small></div><div className="summary-card"><span>Profile details</span><strong>{students.filter((student) => student.institution || student.branch || student.graduationYear).length}</strong><small>Students with academic details</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>Student progress</h2><p>Academic profile and application activity for students assigned to you.</p></div><span className="role-chip">{students.length} ASSIGNED</span></div>{students.length ? <div className="application-list">{students.map((student) => <article className="application-row applicant-row" key={student.id}><div><strong>{student.name}</strong><p>{[student.headline, student.branch, student.graduationYear ? `Class of ${student.graduationYear}` : null].filter(Boolean).join(' · ') || 'Academic profile not completed'}</p><span className="applicant-detail">{[student.institution, student.cgpa === null ? null : `CGPA ${student.cgpa.toFixed(2)}`, student.skills.slice(0, 4).join(', ') || null].filter(Boolean).join(' · ') || student.email}</span></div><span className="status-pill">{student.applicationCount} {student.applicationCount === 1 ? 'application' : 'applications'}</span></article>)}</div> : <div className="empty-state"><strong>No students assigned yet</strong><p>An administrator can assign students to your account from Role access.</p></div>}</section></>
}

function PlacementContent({ active, listings, onDecision, pendingId }: { active: string; listings: ReviewListing[]; onDecision: (id: string, decision: 'publish' | 'reject') => void; pendingId: string }) {
  if (active === 'reports') return <><div className="dashboard-summary"><div className="summary-card"><span>Listings awaiting review</span><strong>{listings.length}</strong><small>Current queue</small></div><div className="summary-card"><span>Placement records</span><strong>Private</strong><small>Only verified aggregate reports</small></div><div className="summary-card"><span>Candidate decisions</span><strong>Human-led</strong><small>No model makes hiring decisions</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>Placement reports</h2><p>Aggregate placement reporting is unavailable until institution-level cohort assignments are configured.</p></div></div><div className="empty-state"><strong>No authorized placement report data</strong><p>Reporting is intentionally withheld until approved data scopes are assigned.</p></div></section></>
  return <><div className="dashboard-summary"><div className="summary-card"><span>Listings awaiting review</span><strong>{listings.length}</strong><small>Human review required</small></div><div className="summary-card"><span>Queue limit</span><strong>{listings.length === 100 ? '100+' : listings.length}</strong><small>Most recent submissions</small></div><div className="summary-card"><span>Publication</span><strong>Manual</strong><small>Published only after review</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>Listing review queue</h2><p>Review the role details before publishing. Decisions are recorded in the audit log.</p></div></div>{listings.length ? <div className="job-list">{listings.map((listing) => <article className="job-card review-card" key={listing.id}><div className="job-card-top"><div><h3>{listing.title}</h3><p>{listing.companyName} · {listing.location} · {listing.workMode}</p></div><span className="status-pill">Pending review</span></div><p className="job-description">{listing.description}</p>{listing.requiredSkills.length > 0 && <div className="skill-list">{listing.requiredSkills.map((skill) => <span className="skill-chip" key={skill}>{skill}</span>)}</div>}<p className="review-meta">Submitted {new Date(listing.submittedAt).toLocaleDateString()}{listing.deadline ? ` · Deadline ${listing.deadline}` : ''}</p><div className="review-actions"><button className="button button-dark" type="button" disabled={Boolean(pendingId)} onClick={() => onDecision(listing.id, 'publish')}>{pendingId === listing.id ? 'Saving…' : 'Approve and publish'}</button><button className="button button-secondary" type="button" disabled={Boolean(pendingId)} onClick={() => onDecision(listing.id, 'reject')}>Reject listing</button></div></article>)}</div> : <div className="empty-state"><strong>No listings awaiting review</strong><p>New recruiter submissions will appear here for a human decision.</p></div>}</section></>
}

function AdminContent({ active, models, capabilities, users, assignments, audit, currentUserId, changingRoleId, assignmentPending, onRoleChange, onAssign, onUnassign }: { active: string; models: ModelRow[]; capabilities: ServiceCapability[]; users: AdminUser[]; assignments: FacultyAssignment[]; audit: AuditEntry[]; currentUserId: string; changingRoleId: string; assignmentPending: boolean; onRoleChange: (userId: string, role: string) => void; onAssign: (event: FormEvent<HTMLFormElement>) => void; onUnassign: (facultyUserId: string, studentUserId: string) => void }) {
  if (active === 'models') return <><section className="dashboard-section"><div className="section-heading"><div><h2>Service capabilities</h2><p>Operational functions and training status are tracked separately. A complete training contract does not approve deployment.</p></div></div><div className="service-capability-list">{capabilities.map((capability) => <article className="service-capability" key={capability.task}><div className="service-capability-heading"><strong>{capability.displayName}</strong><span className="status-pill">{capability.lifecycle.replaceAll('_', ' ')}</span></div><p>{capability.description}</p><small>{capability.limitation}</small></article>)}</div></section><section className="dashboard-section"><div className="section-heading"><div><h2>Independent ML task registry</h2><p>Registry status comes from the database. No model is marked trained by default.</p></div><span className="role-chip">{models.length} REGISTERED</span></div>{models.length ? <div className="application-list">{models.map((model) => <div key={model.id} className="application-row"><div><strong>{model.modelName} · {model.version}</strong><p>{model.task} · {Object.keys(model.evaluationMetrics ?? {}).length ? 'Evaluation recorded' : 'No evaluation metrics recorded'}</p></div><span className="status-pill">{model.trainingStatus.replaceAll('_', ' ')} · {model.approvalStatus}</span></div>)}</div> : <div className="empty-state"><strong>No model artifacts registered</strong><p>Tasks stay offline until training, evaluation, review, and approval are recorded.</p></div>}</section></>
  if (active === 'users') {
    const facultyUsers = users.filter((entry) => entry.role === 'faculty')
    const studentUsers = users.filter((entry) => entry.role === 'student')
    return <><section className="dashboard-section"><div className="section-heading"><div><h2>Faculty assignments</h2><p>Assign students to a faculty member to grant scoped access to their academic progress.</p></div><span className="role-chip">{assignments.length} ASSIGNMENTS</span></div><form className="profile-form" onSubmit={onAssign}><label className="form-field"><span>Faculty member</span><select name="facultyUserId" defaultValue="" required><option value="" disabled>Choose faculty member</option>{facultyUsers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.email}</option>)}</select></label><label className="form-field"><span>Student</span><select name="studentUserId" defaultValue="" required><option value="" disabled>Choose student</option>{studentUsers.map((entry) => <option key={entry.id} value={entry.id}>{entry.name} · {entry.email}</option>)}</select></label><div className="profile-form-actions"><button className="button button-dark" type="submit" disabled={assignmentPending || !facultyUsers.length || !studentUsers.length}>{assignmentPending ? 'Saving…' : 'Assign student'}</button></div></form>{assignments.length ? <div className="application-list">{assignments.map((assignment) => { const faculty = users.find((entry) => entry.id === assignment.facultyUserId); const student = users.find((entry) => entry.id === assignment.studentUserId); return <div className="application-row" key={`${assignment.facultyUserId}-${assignment.studentUserId}`}><div><strong>{student?.name ?? 'Student account'}</strong><p>{student?.email ?? 'Account outside the recent user list'} · Assigned to {faculty?.name ?? 'faculty account'}</p></div><button className="button button-secondary" type="button" disabled={assignmentPending} onClick={() => onUnassign(assignment.facultyUserId, assignment.studentUserId)}>Remove</button></div> })}</div> : <div className="empty-state"><strong>No faculty assignments yet</strong><p>New assignments give faculty access only to the selected student profiles.</p></div>}</section><section className="dashboard-section"><div className="section-heading"><div><h2>Role access</h2><p>Elevated roles are managed by administrators and every role change is audited.</p></div><span className="role-chip">{users.length} ACCOUNTS</span></div>{users.length ? <div className="application-list">{users.map((entry) => <div className="application-row admin-user-row" key={entry.id}><div><strong>{entry.name}</strong><p>{entry.email} · Joined {new Date(entry.createdAt).toLocaleDateString()}</p></div><label className="stage-control"><span className="sr-only">Role for {entry.name}</span><select className="stage-select" value={entry.role} disabled={Boolean(changingRoleId) || entry.id === currentUserId} onChange={(event) => onRoleChange(entry.id, event.target.value)}>{['student', 'company_recruiter', 'faculty', 'placement_officer', 'administrator'].map((roleOption) => <option key={roleOption} value={roleOption}>{displayRole(roleOption)}</option>)}</select></label></div>)}</div> : <div className="empty-state"><strong>No user accounts found</strong></div>}</section></>
  }
  if (active === 'audit') return <section className="dashboard-section"><div className="section-heading"><div><h2>Audit activity</h2><p>Recent privileged changes and account activity.</p></div><span className="role-chip">{audit.length} EVENTS</span></div>{audit.length ? <div className="application-list">{audit.map((entry) => <div className="application-row audit-row" key={entry.id}><div><strong>{entry.action.replaceAll('.', ' ')}</strong><p>{entry.actorName ?? 'System'} · {entry.resourceType}{entry.resourceId ? ` · ${entry.resourceId}` : ''} · {new Date(entry.createdAt).toLocaleString()}</p><span className="applicant-detail">{JSON.stringify(entry.metadata ?? {})}</span></div></div>)}</div> : <div className="empty-state"><strong>No audit events recorded</strong></div>}</section>
  return <><div className="dashboard-summary"><div className="summary-card"><span>Model artifacts</span><strong>{models.length}</strong><small>Loaded from the registry</small></div><div className="summary-card"><span>Accounts in scope</span><strong>{users.length}</strong><small>Recent 200 user records</small></div><div className="summary-card"><span>Audit events</span><strong>{audit.length}</strong><small>Recent 100 events</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>Administrator overview</h2><p>Privileged access and record-level scopes are enforced by server routes.</p></div></div><div className="empty-state"><strong>Role access is institution-managed</strong><p>Use the Role access and Audit activity sections to administer accounts and review recorded changes.</p></div></section></>
}
