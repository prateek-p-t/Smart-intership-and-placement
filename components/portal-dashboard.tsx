'use client'

import { useMemo, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Activity, ArrowRight, Bell, BriefcaseBusiness, Building2, Check, ChevronRight, CircleHelp, Compass, Download, FileCheck2, FileText, GraduationCap, LayoutDashboard, LoaderCircle, LogOut, MapPin, Plus, ShieldCheck, Sparkles, Trash2, Upload, UserRound, Users, WandSparkles } from 'lucide-react'
import { signOut } from '@/lib/auth-client'
import { checkEligibility, displayRole, explainSkillFit, initials } from '@/lib/portal/logic'

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
type ModelRow = { id: string; modelName: string; task: string; version: string; trainingStatus: string; approvalStatus: string; deploymentStatus: string; evaluationMetrics: Record<string, unknown> }
type Resume = { id: string; originalName: string; byteSize: number; createdAt: string }
type NavItem = { id: string; label: string; icon: typeof LayoutDashboard }

export function PortalDashboard({ user, profile: initialProfile, listings, applications, recruiterListings, modelRows, resumes: initialResumes }: {
  user: { id: string; name: string; email: string }; profile: Profile; listings: Listing[]; applications: Application[]; recruiterListings: RecruiterListing[]; modelRows: ModelRow[]; resumes: Resume[]
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
  const [search, setSearch] = useState('')
  const [saving, setSaving] = useState(false)
  const role = profile.role

  const navItems: NavItem[] = useMemo(() => {
    if (role === 'student') return [
      { id: 'overview', label: 'Overview', icon: LayoutDashboard },
      { id: 'opportunities', label: 'Opportunities', icon: Compass },
      { id: 'applications', label: 'My applications', icon: FileCheck2 },
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
    setNotice('')
    try {
      const response = await fetch('/api/applications', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ internshipId: listingId }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to submit this application.')
      setAppliedIds((previous) => new Set(previous).add(listingId))
      setNotice('Your application has been submitted.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to submit this application.')
    } finally {
      setPendingId('')
    }
  }

  async function saveProfile(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const formData = new FormData(event.currentTarget)
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/profile', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        headline: formData.get('headline'), institution: formData.get('institution'), branch: formData.get('branch'), graduationYear: formData.get('graduationYear') || null, cgpa: formData.get('cgpa') || null,
        skills: String(formData.get('skills') ?? '').split(',').map((skill) => skill.trim()).filter(Boolean),
        interests: String(formData.get('interests') ?? '').split(',').map((interest) => interest.trim()).filter(Boolean),
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to save your profile.')
      setProfile({ ...profile, ...result.profile })
      setNotice('Your profile has been saved.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to save your profile.')
    } finally {
      setSaving(false)
    }
  }

  async function uploadResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const file = new FormData(form).get('file')
    if (!(file instanceof File) || file.size === 0) {
      setNotice('Choose a PDF resume to upload.')
      return
    }
    if (file.size > 4 * 1024 * 1024) {
      setNotice('Resume must be 4 MB or smaller.')
      return
    }
    setUploadingResume(true)
    setNotice('')
    try {
      const data = new FormData()
      data.append('file', file)
      const response = await fetch('/api/resumes', { method: 'POST', body: data })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to upload this resume.')
      setResumes((previous) => [result.resume as Resume, ...previous].slice(0, 10))
      form.reset()
      setNotice('Your resume has been uploaded securely.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to upload this resume.')
    } finally {
      setUploadingResume(false)
    }
  }

  async function deleteResume(id: string) {
    setDeletingResumeId(id)
    setNotice('')
    try {
      const response = await fetch('/api/resumes', { method: 'DELETE', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to delete this resume.')
      setResumes((previous) => previous.filter((resume) => resume.id !== id))
      setNotice('Your resume has been deleted.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to delete this resume.')
    } finally {
      setDeletingResumeId('')
    }
  }

  async function createListing(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = event.currentTarget
    const data = new FormData(form)
    setSaving(true)
    setNotice('')
    try {
      const response = await fetch('/api/internships', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        title: data.get('title'), companyName: data.get('companyName'), location: data.get('location'), description: data.get('description'), workMode: data.get('workMode'), requiredSkills: String(data.get('requiredSkills') ?? '').split(',').map((skill) => skill.trim()).filter(Boolean), deadline: data.get('deadline') || null,
      }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'Unable to submit this listing.')
      form.reset()
      setNotice('Opportunity submitted for placement-office review.')
      router.refresh()
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'Unable to submit this listing.')
    } finally {
      setSaving(false)
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
        <nav className="dashboard-nav" aria-label="Workspace navigation">{navItems.map(({ id, label, icon: Icon }) => <button key={id} type="button" aria-current={active === id ? 'page' : undefined} onClick={() => { setActive(id); setNotice('') }}><Icon size={16} /><span>{label}</span></button>)}</nav>
        <div className="dashboard-sidebar-foot"><span className="role-chip">{roleLabel.toUpperCase()}</span><span>Access follows your assigned role.</span></div>
      </aside>
      <section className="dashboard-main">
        <header className="dashboard-topbar"><button type="button" className="icon-button" aria-label="Notifications"><Bell size={15} /></button><div className="signed-in-user"><span className="user-avatar">{initials(user.name)}</span><span>{user.name}</span></div><button className="signout-button" type="button" onClick={handleSignOut}>Sign out</button></header>
        <div className="dashboard-content">
          <div className="dashboard-welcome"><div><div className="eyebrow"><span className="eyebrow-dot" /> YOUR {roleLabel.toUpperCase()} WORKSPACE</div><h1>{active === 'overview' ? `Good to see you, ${user.name.split(' ')[0]}.` : navItems.find((item) => item.id === active)?.label}</h1><p>{active === 'overview' ? role === 'student' ? 'Your next opportunity starts with a clear view of what fits.' : `Your ${roleLabel.toLowerCase()} tools and authorized records, all in one place.` : 'Explore the information and tools available to your account.'}</p></div>{role === 'student' && <div className="profile-row"><span>PROFILE DETAILS</span><span><i style={{ width: `${profileCompleteness(profile)}%` }} /></span><strong>{profileCompleteness(profile)}%</strong></div>}</div>
          {notice && <div className={notice.includes('unable') || notice.includes('Unable') ? 'form-error' : 'profile-success'} role="status">{notice}</div>}
          {role === 'student' && <StudentContent active={active} profile={profile} listings={filteredListings} applications={applications} appliedIds={appliedIds} pendingId={pendingId} onApply={apply} search={search} onSearch={setSearch} onSaveProfile={saveProfile} saving={saving} resumes={resumes} onUploadResume={uploadResume} onDeleteResume={deleteResume} uploadingResume={uploadingResume} deletingResumeId={deletingResumeId} />}
          {role === 'company_recruiter' && <RecruiterContent active={active} listings={recruiterListings} onCreate={createListing} saving={saving} />}
          {role === 'faculty' && <FacultyContent active={active} />}
          {role === 'placement_officer' && <PlacementContent active={active} />}
          {role === 'administrator' && <AdminContent active={active} models={modelRows} />}
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

function StudentContent({ active, profile, listings, applications, appliedIds, pendingId, onApply, search, onSearch, onSaveProfile, saving, resumes, onUploadResume, onDeleteResume, uploadingResume, deletingResumeId }: {
  active: string; profile: Profile; listings: Listing[]; applications: Application[]; appliedIds: Set<string>; pendingId: string; onApply: (id: string) => void; search: string; onSearch: (value: string) => void; onSaveProfile: (event: FormEvent<HTMLFormElement>) => void; saving: boolean; resumes: Resume[]; onUploadResume: (event: FormEvent<HTMLFormElement>) => void; onDeleteResume: (id: string) => void; uploadingResume: boolean; deletingResumeId: string
}) {
  if (active === 'profile') return <section className="dashboard-section"><div className="section-heading"><div><h2>Your profile</h2><p>Add accurate details to make eligibility checks more useful.</p></div></div><form className="profile-form" onSubmit={onSaveProfile}>
    <label className="form-field"><span>Headline</span><input name="headline" defaultValue={profile.headline ?? ''} maxLength={160} placeholder="e.g. Computer science student" /></label>
    <label className="form-field"><span>Institution</span><input name="institution" defaultValue={profile.institution ?? ''} maxLength={160} placeholder="University or college" /></label>
    <label className="form-field"><span>Degree branch</span><input name="branch" defaultValue={profile.branch ?? ''} maxLength={100} placeholder="e.g. Computer Science" /></label>
    <label className="form-field"><span>Graduation year</span><input name="graduationYear" type="number" min="2000" max="2100" defaultValue={profile.graduationYear ?? ''} /></label>
    <label className="form-field"><span>CGPA (0–10)</span><input name="cgpa" type="number" min="0" max="10" step="0.01" defaultValue={profile.cgpa ?? ''} /></label>
    <label className="form-field"><span>Skills, comma separated</span><input name="skills" defaultValue={profile.skills.join(', ')} maxLength={1200} placeholder="Python, SQL, Figma" /></label>
    <label className="form-field full-field"><span>Career interests, comma separated</span><input name="interests" defaultValue={profile.interests.join(', ')} maxLength={800} placeholder="Product design, data analytics" /></label>
    <div className="profile-form-actions"><button className="button button-dark" disabled={saving} type="submit">{saving ? 'Saving…' : 'Save profile'}</button>{saving && <LoaderCircle className="spin" size={16} />}</div>
  </form><section className="dashboard-section"><div className="section-heading"><div><h2>Resume documents</h2><p>Private PDFs are visible only to your account. Maximum file size: 4 MB.</p></div><span className="role-chip">{resumes.length} SAVED</span></div><form className="resume-upload" onSubmit={onUploadResume}><label className="form-field"><span>Choose a PDF resume</span><input name="file" type="file" accept="application/pdf,.pdf" required /></label><button className="button button-dark" type="submit" disabled={uploadingResume}>{uploadingResume ? <><LoaderCircle className="spin" size={15} /> Uploading…</> : <><Upload size={15} /> Upload resume</>}</button></form>{resumes.length ? <ul className="resume-list">{resumes.map((resume) => <li className="resume-row" key={resume.id}><span className="resume-file-icon"><FileText size={17} /></span><div className="resume-file-details"><strong>{resume.originalName}</strong><span>{formatFileSize(resume.byteSize)} · Uploaded <time dateTime={resume.createdAt}>{new Date(resume.createdAt).toLocaleDateString()}</time></span></div><a className="resume-action" href={`/api/resumes/${encodeURIComponent(resume.id)}`} aria-label={`Download ${resume.originalName}`}><Download size={15} /><span>Download</span></a><button className="resume-action resume-delete" type="button" disabled={deletingResumeId === resume.id} aria-label={`Delete ${resume.originalName}`} onClick={() => { if (window.confirm(`Delete ${resume.originalName}?`)) onDeleteResume(resume.id) }}>{deletingResumeId === resume.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}<span>Delete</span></button></li>)}</ul> : <div className="empty-state"><strong>No resumes uploaded</strong><p>Upload a PDF to keep a private copy in your workspace.</p></div>}</section></section>

  if (active === 'applications') return <section className="dashboard-section"><div className="section-heading"><div><h2>Application history</h2><p>Only applications created by your account are shown here.</p></div><span className="role-chip">{applications.length} TOTAL</span></div>{applications.length ? <div className="application-list">{applications.map((application) => <div key={application.id} className="application-row"><div><strong>{application.title}</strong><p>{application.companyName} · Submitted {new Date(application.createdAt).toLocaleDateString()}</p></div><span className="status-pill">{application.status.replaceAll('_', ' ')}</span></div>)}</div> : <div className="empty-state"><strong>No applications yet</strong><p>When you apply to an opportunity, its current stage will show up here.</p></div>}</section>

  if (active === 'opportunities') return <section className="dashboard-section"><div className="section-heading"><div><h2>Open opportunities</h2><p>Published listings only. Skill overlap is explained, not treated as a qualification.</p></div><label className="search-field"><Compass size={14} /><input aria-label="Search opportunities" value={search} onChange={(event) => onSearch(event.target.value)} placeholder="Search roles, skills, places" /></label></div><ListingList listings={listings} profile={profile} appliedIds={appliedIds} pendingId={pendingId} onApply={onApply} /></section>

  return <>
    <div className="dashboard-summary"><div className="summary-card"><span>Published opportunities</span><strong>{listings.length}</strong><small>Open in your workspace</small></div><div className="summary-card"><span>Your applications</span><strong>{applications.length}</strong><small>Scoped to your account</small></div><div className="summary-card"><span>Profile details</span><strong>{profileCompleteness(profile)}%</strong><small>Based on fields completed</small></div></div>
    <section className="dashboard-section"><div className="section-heading"><div><h2>Opportunities to explore</h2><p>Ordered by skill overlap. No learned model is represented as active.</p></div><button className="inline-action" type="button" onClick={() => window.dispatchEvent(new CustomEvent('pathway:tab', { detail: 'opportunities' }))}>View all <ChevronRight size={14} /></button></div><ListingList listings={listings.slice(0, 5)} profile={profile} appliedIds={appliedIds} pendingId={pendingId} onApply={onApply} /></section>
    <section className="dashboard-section"><div className="section-heading"><div><h2>Recent applications</h2><p>Your latest updates, visible only to you.</p></div></div>{applications.length ? <div className="application-list">{applications.slice(0, 4).map((application) => <div key={application.id} className="application-row"><div><strong>{application.title}</strong><p>{application.companyName}</p></div><span className="status-pill">{application.status.replaceAll('_', ' ')}</span></div>)}</div> : <div className="empty-state"><strong>Your application activity will show here</strong><p>Start with a published opportunity that fits your interests.</p></div>}</section>
  </>
}

function ListingList({ listings, profile, appliedIds, pendingId, onApply }: { listings: Listing[]; profile: Profile; appliedIds: Set<string>; pendingId: string; onApply: (id: string) => void }) {
  if (!listings.length) return <div className="empty-state"><strong>No published opportunities yet</strong><p>When a verified listing is published, it will appear here.</p></div>
  return <div className="job-list">{listings.map((listing) => {
    const match = explainSkillFit(profile.skills, listing.requiredSkills)
    const eligibility = checkEligibility(profile, listing.eligibility)
    return <article className="job-card" key={listing.id}><div className="job-card-top"><div className="job-title-wrap"><span className="company-mark">{listing.companyName.slice(0, 1).toUpperCase()}</span><div><h3>{listing.title}</h3><p>{listing.companyName}</p></div></div>{match.score !== null && <span className="match-pill">{match.score}% skill overlap</span>}</div><div className="job-meta"><span><MapPin size={13} />{listing.location}</span><span><Building2 size={13} />{listing.workMode}</span><span>{eligibility.criteriaCount ? eligibility.eligible ? 'Meets listed criteria' : 'Criteria not met or profile incomplete' : 'No hard criteria listed'}</span>{listing.deadline && <span>Apply by {new Date(`${listing.deadline}T00:00:00`).toLocaleDateString()}</span>}</div>{listing.requiredSkills.length > 0 && <div className="skill-list" aria-label="Required skills">{listing.requiredSkills.slice(0, 6).map((skill) => <span className="skill-chip" key={skill}>{skill}{match.matched.includes(skill) ? ' · matched' : ''}</span>)}</div>}<p className="job-description">{listing.description}</p>{!eligibility.eligible && eligibility.criteriaCount > 0 && <p className="eligibility-note">Review the posted criteria before applying. Missing profile information is not assumed to meet a requirement.</p>}<button className="apply-button" type="button" disabled={appliedIds.has(listing.id) || pendingId === listing.id} onClick={() => onApply(listing.id)}>{pendingId === listing.id ? 'Submitting…' : appliedIds.has(listing.id) ? 'Application submitted' : 'Apply for this role'}{pendingId !== listing.id && <ArrowRight size={13} />}</button></article>
  })}</div>
}

function RecruiterContent({ active, listings, onCreate, saving }: { active: string; listings: RecruiterListing[]; onCreate: (event: FormEvent<HTMLFormElement>) => void; saving: boolean }) {
  if (active === 'create-listing') return <section className="dashboard-section"><div className="section-heading"><div><h2>Submit an opportunity</h2><p>New listings enter review and won&apos;t appear to students until approved.</p></div></div><form className="profile-form" onSubmit={onCreate}><label className="form-field"><span>Role title</span><input name="title" required maxLength={120} /></label><label className="form-field"><span>Company name</span><input name="companyName" required maxLength={120} /></label><label className="form-field"><span>Location</span><input name="location" required maxLength={160} /></label><label className="form-field"><span>Work mode</span><select name="workMode" defaultValue="Hybrid"><option>On-site</option><option>Hybrid</option><option>Remote</option></select></label><label className="form-field"><span>Required skills</span><input name="requiredSkills" placeholder="Python, SQL, React" maxLength={800} /></label><label className="form-field"><span>Application deadline</span><input name="deadline" type="date" /></label><label className="form-field full-field"><span>Description</span><textarea name="description" required minLength={30} maxLength={3000} rows={5} /></label><div className="profile-form-actions"><button className="button button-dark" type="submit" disabled={saving}>{saving ? 'Submitting…' : 'Submit for review'}</button></div></form></section>
  return <><div className="dashboard-summary"><div className="summary-card"><span>Listings you own</span><strong>{listings.length}</strong><small>Restricted to your account</small></div><div className="summary-card"><span>Published</span><strong>{listings.filter((listing) => listing.status === 'published').length}</strong><small>Visible in the student marketplace</small></div><div className="summary-card"><span>Pending review</span><strong>{listings.filter((listing) => listing.status === 'pending_review').length}</strong><small>Awaiting placement-office approval</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>{active === 'listings' ? 'Your listings' : 'Recruitment workspace'}</h2><p>Listings and status are scoped to your verified recruiter account.</p></div></div>{listings.length ? <div className="application-list">{listings.map((listing) => <div key={listing.id} className="application-row"><div><strong>{listing.title}</strong><p>{listing.companyName}{listing.deadline ? ` · Deadline ${listing.deadline}` : ''}</p></div><span className="status-pill">{listing.status.replaceAll('_', ' ')}</span></div>)}</div> : <div className="empty-state"><strong>No listings yet</strong><p>Submit a role and the placement office can review it for publication.</p></div>}</section></>
}

function FacultyContent({ active }: { active: string }) {
  return <><div className="dashboard-summary"><div className="summary-card"><span>Assigned cohorts</span><strong>—</strong><small>Assignment scope not configured</small></div><div className="summary-card"><span>Student records</span><strong>Private</strong><small>Only assigned students are visible</small></div><div className="summary-card"><span>Academic insights</span><strong>—</strong><small>No authorized report data yet</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>{active === 'reports' ? 'Academic reports' : 'Student progress'}</h2><p>Faculty access is limited to student records assigned by the institution.</p></div></div><div className="empty-state"><strong>No student cohort has been assigned</strong><p>Ask an administrator to configure a faculty-to-cohort assignment before student records are available.</p></div></section></>
}

function PlacementContent({ active }: { active: string }) {
  return <><div className="dashboard-summary"><div className="summary-card"><span>Listings for review</span><strong>—</strong><small>Review queue is being configured</small></div><div className="summary-card"><span>Placement records</span><strong>Private</strong><small>Only verified aggregate reports</small></div><div className="summary-card"><span>Candidate decisions</span><strong>Human-led</strong><small>No model makes hiring decisions</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>{active === 'reports' ? 'Placement reports' : 'Recruitment operations'}</h2><p>Review access will be added after the institution defines its approval workflow.</p></div></div><div className="empty-state"><strong>No review queue available</strong><p>Listing publication requires a configured placement-office approval and audit workflow.</p></div></section></>
}

function AdminContent({ active, models }: { active: string; models: ModelRow[] }) {
  if (active === 'models') return <section className="dashboard-section"><div className="section-heading"><div><h2>Independent ML task registry</h2><p>Registry status comes from the database. No model is marked trained by default.</p></div><span className="role-chip">{models.length} REGISTERED</span></div>{models.length ? <div className="application-list">{models.map((model) => <div key={model.id} className="application-row"><div><strong>{model.modelName} · {model.version}</strong><p>{model.task} · {Object.keys(model.evaluationMetrics ?? {}).length ? 'Evaluation recorded' : 'No evaluation metrics recorded'}</p></div><span className="status-pill">{model.trainingStatus.replaceAll('_', ' ')} · {model.approvalStatus}</span></div>)}</div> : <div className="empty-state"><strong>No model artifacts registered</strong><p>Tasks stay offline until training, evaluation, review, and approval are recorded.</p></div>}</section>
  return <><div className="dashboard-summary"><div className="summary-card"><span>Model artifacts</span><strong>{models.length}</strong><small>Loaded from the registry</small></div><div className="summary-card"><span>Deployment status</span><strong>Offline</strong><small>Until documented approval</small></div><div className="summary-card"><span>Access model</span><strong>Role-based</strong><small>Elevated roles are assigned server-side</small></div></div><section className="dashboard-section"><div className="section-heading"><div><h2>{active === 'users' ? 'Role access' : active === 'audit' ? 'Audit activity' : 'Administrator overview'}</h2><p>Privileged access and record-level scopes are enforced by server routes.</p></div></div><div className="empty-state"><strong>Administrator tools are not exposed to self-registered accounts</strong><p>Role assignment, audit review, and data retention settings require an administrator account created through the institution&apos;s verified process.</p></div></section></>
}
