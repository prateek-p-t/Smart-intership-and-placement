import type { CareerMilestone } from './types'

const roleSkillSets: Array<{ match: RegExp; skills: string[] }> = [
  { match: /front.?end|frontend|web developer|ui engineer/i, skills: ['JavaScript', 'TypeScript', 'React', 'HTML', 'CSS', 'Accessibility', 'API integration', 'Testing', 'Git'] },
  { match: /back.?end|backend|api engineer|server engineer/i, skills: ['Node.js', 'TypeScript', 'REST APIs', 'SQL', 'PostgreSQL', 'Authentication', 'Testing', 'Git', 'Security'] },
  { match: /full.?stack|fullstack/i, skills: ['JavaScript', 'TypeScript', 'React', 'Node.js', 'REST APIs', 'SQL', 'PostgreSQL', 'Testing', 'Git'] },
  { match: /data analyst|business analyst|analytics/i, skills: ['SQL', 'Python', 'Spreadsheets', 'Statistics', 'Data cleaning', 'Data visualization', 'Dashboards', 'Communication'] },
  { match: /machine learning|ml engineer|ai engineer/i, skills: ['Python', 'Statistics', 'Pandas', 'scikit-learn', 'Model evaluation', 'Feature engineering', 'APIs', 'Docker'] },
  { match: /data scientist/i, skills: ['Python', 'SQL', 'Statistics', 'Pandas', 'Data visualization', 'Feature engineering', 'Model evaluation', 'Communication'] },
  { match: /ux|user experience|product designer|ui designer/i, skills: ['Figma', 'User research', 'Wireframing', 'Prototyping', 'Interaction design', 'Accessibility', 'Usability testing', 'Communication'] },
  { match: /product manager|product owner/i, skills: ['User research', 'Requirements', 'Prioritization', 'Product analytics', 'Experiment design', 'Roadmapping', 'Communication', 'Stakeholder management'] },
  { match: /devops|cloud engineer|site reliability|sre/i, skills: ['Linux', 'Git', 'Scripting', 'Docker', 'CI/CD', 'Cloud fundamentals', 'Monitoring', 'Networking', 'Security'] },
  { match: /cybersecurity|security analyst/i, skills: ['Networking', 'Linux', 'Security fundamentals', 'Threat modeling', 'Incident response', 'Scripting', 'Risk assessment', 'Communication'] },
]

const aliases: Record<string, string> = {
  js: 'javascript', 'react.js': 'react', 'reactjs': 'react', ts: 'typescript', 'node': 'node.js', 'nodejs': 'node.js',
  postgres: 'postgresql', 'rest api': 'rest apis', 'restful apis': 'rest apis', 'scikit learn': 'scikit-learn', sklearn: 'scikit-learn',
  'user experience research': 'user research', 'ui/ux': 'interaction design', 'ci cd': 'ci/cd', 'continuous integration': 'ci/cd',
  'data visualisation': 'data visualization', 'ms excel': 'spreadsheets', excel: 'spreadsheets',
}

function normalizeSkill(skill: string) {
  const normalized = skill.toLowerCase().replace(/[._/]+/g, ' ').replace(/\s+/g, ' ').trim()
  return aliases[normalized] ?? normalized
}

export function targetSkillsForRole(targetRole: string, customSkills: string[] = []) {
  const cleanedCustom = Array.from(new Set(customSkills.map((skill) => skill.trim()).filter(Boolean)))
  if (cleanedCustom.length) return cleanedCustom.slice(0, 24)
  const template = roleSkillSets.find(({ match }) => match.test(targetRole))
  return template?.skills ?? ['Role fundamentals', 'Problem solving', 'Project delivery', 'Communication']
}

export function buildRoadmap(input: {
  id: string
  targetRole: string
  targetSkills: string[]
  profileSkills: string[]
  resumeSkills: string[]
  sourceResumeId: string | null
  sourceResumeName: string | null
  createdAt: Date
  updatedAt: Date
}) {
  const providedSkills = [...input.profileSkills, ...input.resumeSkills].filter((skill) => skill.trim())
  const providedSkillKeys = new Set(providedSkills.map(normalizeSkill))
  const matchedSkills = input.targetSkills.filter((skill) => providedSkillKeys.has(normalizeSkill(skill)))
  const missingSkills = input.targetSkills.filter((skill) => !providedSkillKeys.has(normalizeSkill(skill)))
  const matchScore = input.targetSkills.length ? Math.round((matchedSkills.length / input.targetSkills.length) * 100) : 0
  const milestones = createMilestones(input.targetRole, input.targetSkills, missingSkills)

  return {
    id: input.id,
    targetRole: input.targetRole,
    targetSkills: input.targetSkills,
    matchedSkills,
    missingSkills,
    matchScore,
    roleSummary: `A transparent skills baseline for ${input.targetRole}. Compatibility compares listed target skills with your profile${input.sourceResumeId ? ' and extracted resume skills' : ''}; it is not a hiring decision or a verified qualification.`,
    milestones,
    sourceResumeId: input.sourceResumeId,
    sourceResumeName: input.sourceResumeName,
    completedMilestones: [] as string[],
    createdAt: input.createdAt.toISOString(),
    updatedAt: input.updatedAt.toISOString(),
  }
}

function createMilestones(targetRole: string, targetSkills: string[], missingSkills: string[]): CareerMilestone[] {
  const foundationSkills = missingSkills.slice(0, 3)
  const practiceSkills = missingSkills.slice(3, 6)
  const foundationFocus = foundationSkills.length ? foundationSkills.join(', ') : targetSkills.slice(0, 3).join(', ')
  const practiceFocus = practiceSkills.length ? practiceSkills.join(', ') : targetSkills.slice(3, 6).join(', ') || targetSkills.slice(0, 3).join(', ')

  return [
    {
      id: 'foundations', title: 'Strengthen your foundations', focus: foundationFocus,
      actions: [
        foundationSkills.length ? `Choose a structured course or documentation path for ${foundationSkills.join(' and ')}.` : `Review your current understanding of ${foundationFocus} and note one area to deepen.`,
        'Set a weekly learning block and keep short notes or code examples as evidence.',
      ],
      outcome: 'A focused learning log and a small practice artifact for your priority skills.', durationWeeks: 2, skills: foundationSkills.length ? foundationSkills : targetSkills.slice(0, 3),
    },
    {
      id: 'applied-project', title: `Apply the skills in a ${targetRole} project`, focus: practiceFocus,
      actions: [
        `Build one small project that reflects a realistic ${targetRole} task and uses ${practiceFocus}.`,
        'Write down the decisions you made, the trade-offs, and what you would improve next.',
      ],
      outcome: 'A demonstrable project with a concise README or case study.', durationWeeks: 3, skills: practiceSkills.length ? practiceSkills : targetSkills.slice(0, 6),
    },
    {
      id: 'evidence-and-review', title: 'Show evidence and review your progress', focus: targetSkills.join(', '),
      actions: [
        'Update your resume or portfolio with specific contributions and outcomes; do not claim skills you have not practiced.',
        `Practice explaining your project and one learning challenge for a ${targetRole} interview.`,
      ],
      outcome: 'A role-focused portfolio entry and a refreshed skills checklist.', durationWeeks: 1, skills: targetSkills,
    },
  ]
}

export function roadmapToClient(row: {
  id: string
  targetRole: string
  targetSkills: string[]
  matchedSkills: string[]
  missingSkills: string[]
  matchScore: number
  roleSummary: string
  milestones: CareerMilestone[]
  sourceResumeId: string | null
  completedMilestones: string[]
  createdAt: Date
  updatedAt: Date
  sourceResumeName: string | null
}) {
  return {
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export function normalizedSkillKey(skill: string) {
  return normalizeSkill(skill)
}

export type { CareerMilestone }
export type BuildRoadmapInput = Parameters<typeof buildRoadmap>[0]
export type RoadmapProgressUpdate = { roadmapId: string; milestoneId: string; completed: boolean }
export type { SavedCareerRoadmap } from './types'
