export type CareerRoadmapMilestone = {
  id: string
  title: string
  objective: string
  activity: string
  estimatedHours: number
}

export type CareerRoadmap = {
  id: string
  targetRole: string
  targetSkills: string[]
  matchedSkills: string[]
  missingSkills: string[]
  matchScore: number
  roleSummary: string
  milestones: CareerRoadmapMilestone[]
  sourceResumeId: string | null
  completedMilestones: string[]
  createdAt: string
  updatedAt: string
}

export type CareerRoadmapInput = {
  targetRole: string
  sourceResumeId?: string | null
}

export function serializeCareerRoadmap(
  roadmap: Omit<CareerRoadmap, 'createdAt' | 'updatedAt'> & { createdAt: Date; updatedAt: Date },
): CareerRoadmap {
  return {
    ...roadmap,
    createdAt: roadmap.createdAt.toISOString(),
    updatedAt: roadmap.updatedAt.toISOString(),
  }
}

export function calculateRoadmapProgress(roadmap: CareerRoadmap) {
  return roadmap.milestones.length
    ? Math.round((roadmap.completedMilestones.length / roadmap.milestones.length) * 100)
    : 0
}
