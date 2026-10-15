export type CareerMilestone = {
  id: string
  title: string
  focus: string
  actions: string[]
  outcome: string
  durationWeeks: number
  skills: string[]
}

export type SavedCareerRoadmap = {
  id: string
  targetRole: string
  targetSkills: string[]
  matchedSkills: string[]
  missingSkills: string[]
  matchScore: number
  roleSummary: string
  milestones: CareerMilestone[]
  sourceResumeId: string | null
  sourceResumeName: string | null
  completedMilestones: string[]
  createdAt: string
  updatedAt: string
}

export type RoadmapResumeOption = {
  id: string
  originalName: string
  createdAt: string
}

export type RoadmapProfile = {
  headline: string | null
  institution: string | null
  branch: string | null
  graduationYear: number | null
  cgpa: string | null
  skills: string[]
  interests: string[]
}

export type CareerRoadmapResponse = {
  roadmap: SavedCareerRoadmap
}
