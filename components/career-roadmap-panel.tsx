'use client'

import { useState, type FormEvent } from 'react'
import { Check, LoaderCircle, Plus, Target, Trash2 } from 'lucide-react'
import { calculateRoadmapProgress, type CareerRoadmap } from '@/lib/portal/roadmap-types'

export function CareerRoadmapPanel({ initialRoadmaps }: { initialRoadmaps: CareerRoadmap[] }) {
  const [roadmaps, setRoadmaps] = useState(initialRoadmaps)
  const [targetRole, setTargetRole] = useState('')
  const [resumeFile, setResumeFile] = useState<File | null>(null)
  const [fileInputKey, setFileInputKey] = useState(0)
  const [creating, setCreating] = useState(false)
  const [busyId, setBusyId] = useState('')
  const [message, setMessage] = useState('')
  const [messageError, setMessageError] = useState(false)

  async function createRoadmap(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setCreating(true)
    setMessage('')
    try {
      const formData = new FormData()
      formData.set('targetRole', targetRole)
      if (resumeFile) formData.set('resumeFile', resumeFile)
      const response = await fetch('/api/career-roadmaps', { method: 'POST', body: formData })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to create this roadmap.')
      setRoadmaps((previous) => [result.roadmap as CareerRoadmap, ...previous].slice(0, 20))
      setTargetRole('')
      setResumeFile(null)
      setFileInputKey((previous) => previous + 1)
      setMessage(result.notice || 'Roadmap created. Your match is a skill overlap, not a hiring prediction.')
      setMessageError(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to create this roadmap.')
      setMessageError(true)
    } finally {
      setCreating(false)
    }
  }

  async function toggleMilestone(roadmap: CareerRoadmap, milestoneId: string) {
    const requestId = `${roadmap.id}:${milestoneId}`
    setBusyId(requestId)
    setMessage('')
    try {
      const response = await fetch(`/api/career-roadmaps/${encodeURIComponent(roadmap.id)}`, {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ milestoneId }),
      })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to update this milestone.')
      setRoadmaps((previous) => previous.map((item) => item.id === roadmap.id
        ? { ...item, completedMilestones: result.completedMilestones, updatedAt: result.updatedAt }
        : item))
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to update this milestone.')
      setMessageError(true)
    } finally {
      setBusyId('')
    }
  }

  async function deleteRoadmap(roadmap: CareerRoadmap) {
    if (!window.confirm(`Delete the roadmap for ${roadmap.targetRole}?`)) return
    setBusyId(roadmap.id)
    setMessage('')
    try {
      const response = await fetch(`/api/career-roadmaps/${encodeURIComponent(roadmap.id)}`, { method: 'DELETE' })
      const result = await response.json().catch(() => ({}))
      if (!response.ok) throw new Error(result.error || 'Unable to delete this roadmap.')
      setRoadmaps((previous) => previous.filter((item) => item.id !== roadmap.id))
      setMessage('Roadmap deleted.')
      setMessageError(false)
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to delete this roadmap.')
      setMessageError(true)
    } finally {
      setBusyId('')
    }
  }

  return <section className="roadmap-panel" aria-labelledby="roadmap-heading">
    <div className="roadmap-panel-heading"><div><span className="tool-kicker">YOUR NEXT MOVE</span><h3 id="roadmap-heading">Build a learning roadmap</h3><p>Choose a target role. We&apos;ll compare its skills with your profile and, if selected, a resume PDF.</p></div><Target size={19} aria-hidden="true" /></div>
    <form className="roadmap-form" onSubmit={createRoadmap}>
      <label className="form-field" htmlFor="roadmap-target-role"><span>Target role or job title</span><input id="roadmap-target-role" value={targetRole} onChange={(event) => setTargetRole(event.target.value)} maxLength={120} minLength={2} required placeholder="e.g. Product designer" /></label>
      <label className="form-field" htmlFor="roadmap-resume-file"><span>Resume PDF <small>(optional, up to 4 MB)</small></span><input key={fileInputKey} id="roadmap-resume-file" type="file" accept="application/pdf,.pdf" onChange={(event) => setResumeFile(event.target.files?.[0] ?? null)} /></label>
      <button className="button button-dark roadmap-create" type="submit" disabled={creating}>{creating ? <><LoaderCircle className="spin" size={15} /> Building…</> : <><Plus size={15} /> Create roadmap</>}</button>
    </form>
    {message && <p className={messageError ? 'roadmap-message roadmap-message-error' : 'roadmap-message'} role={messageError ? 'alert' : 'status'}>{message}</p>}
    <p className="roadmap-privacy">If you select a PDF, it is sent to Vercel AI Gateway with limited profile details for skill extraction and roadmap generation. Pathway does not retain the file; only the roadmap and skill comparison are saved.</p>

    {roadmaps.length ? <div className="roadmap-list">{roadmaps.map((roadmap) => {
      const progress = calculateRoadmapProgress(roadmap)
      return <article className="roadmap-card" key={roadmap.id}>
        <div className="roadmap-card-header"><div><span className="tool-kicker">TARGET ROLE</span><h4>{roadmap.targetRole}</h4></div><button type="button" className="roadmap-delete" aria-label={`Delete roadmap for ${roadmap.targetRole}`} disabled={busyId === roadmap.id} onClick={() => deleteRoadmap(roadmap)}>{busyId === roadmap.id ? <LoaderCircle className="spin" size={15} /> : <Trash2 size={15} />}</button></div>
        <p className="roadmap-summary">{roadmap.roleSummary}</p>
        <div className="roadmap-match-row"><div><strong>{roadmap.matchScore}%</strong><span> skill overlap</span></div><span>{roadmap.matchedSkills.length} of {roadmap.targetSkills.length} skills matched</span></div>
        <div className="roadmap-meter" role="progressbar" aria-label={`${roadmap.matchScore}% skill overlap`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={roadmap.matchScore}><span style={{ width: `${roadmap.matchScore}%` }} /></div>
        <div className="roadmap-skills"><div><strong>Already listed</strong><div className="skill-list">{roadmap.matchedSkills.length ? roadmap.matchedSkills.map((skill) => <span className="skill-chip" key={skill}>{skill}</span>) : <span className="roadmap-empty-copy">No direct matches yet</span>}</div></div><div><strong>Skills to develop</strong><div className="skill-list">{roadmap.missingSkills.length ? roadmap.missingSkills.map((skill) => <span className="skill-chip skill-chip-missing" key={skill}>{skill}</span>) : <span className="roadmap-empty-copy">No target gaps listed</span>}</div></div></div>
        <div className="roadmap-milestones-heading"><div><strong>Learning steps</strong><span>{roadmap.completedMilestones.length} of {roadmap.milestones.length} complete</span></div><span>{progress}%</span></div>
        <div className="roadmap-meter roadmap-progress-meter" role="progressbar" aria-label={`${progress}% roadmap progress`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }} /></div>
        <ol className="roadmap-milestones">{roadmap.milestones.map((milestone) => {
          const completed = roadmap.completedMilestones.includes(milestone.id)
          const requestId = `${roadmap.id}:${milestone.id}`
          return <li className={completed ? 'roadmap-milestone roadmap-milestone-done' : 'roadmap-milestone'} key={milestone.id}>
            <button type="button" className="roadmap-check" aria-pressed={completed} aria-label={`${completed ? 'Mark incomplete' : 'Complete'}: ${milestone.title}`} disabled={busyId === requestId} onClick={() => toggleMilestone(roadmap, milestone.id)}>{completed ? <Check size={14} /> : null}</button>
            <div><strong>{milestone.title}</strong><p>{milestone.objective}</p><p className="roadmap-activity">{milestone.activity}</p><span className="roadmap-hours">About {milestone.estimatedHours} learning hours</span></div>
          </li>
        })}</ol>
        <p className="roadmap-source">Compatibility shows overlap with listed skills; it is not a hiring or qualification prediction.</p>
      </article>
    })}</div> : <div className="roadmap-empty"><strong>Your saved roadmaps will appear here</strong><p>Enter a role above to get a personalized skills comparison and a step-by-step plan.</p></div>}
  </section>
}
