export type ModelLifecycle = 'rules_based' | 'not_trained' | 'experimental' | 'approved' | 'offline'
export type ModelTask = 'internship_recommendation' | 'resume_parsing' | 'salary_prediction' | 'fairness_audit'

export type TrainingContract = {
  task: ModelTask
  datasetVersion: string
  datasetSource: string
  dataOwner: string
  consentAndLegalBasis: string
  targetDefinition: string
  featureManifest: string[]
  excludedFeatures: string[]
  splitStrategy: string
  leakageChecks: string[]
  evaluationMetrics: string[]
  subgroupEvaluation: string[]
  humanReview: string
  retentionPolicy: string
}

export type ServiceCapability = {
  task: ModelTask
  displayName: string
  lifecycle: ModelLifecycle
  isTrained: boolean
  isDeployed: boolean
  description: string
  limitation: string
  trainingContractRequired: boolean
}

export type UnavailableServiceResult = {
  task: ModelTask
  available: false
  lifecycle: 'not_trained' | 'offline'
  reason: string
}

export function unavailableService(task: ModelTask, reason: string): UnavailableServiceResult {
  return { task, available: false, lifecycle: 'offline', reason }
}

export function validateTrainingContract(contract: TrainingContract): string[] {
  const issues: string[] = []
  if (!contract.datasetVersion.trim()) issues.push('A versioned dataset is required.')
  if (!contract.datasetSource.trim()) issues.push('Dataset provenance is required.')
  if (!contract.dataOwner.trim()) issues.push('A data owner must be identified.')
  if (!contract.consentAndLegalBasis.trim()) issues.push('A documented consent or legal basis is required.')
  if (!contract.targetDefinition.trim()) issues.push('The target label must be precisely defined.')
  if (contract.featureManifest.length === 0 || contract.featureManifest.some((feature) => !feature.trim())) issues.push('The feature manifest must list non-empty feature names.')
  if (contract.excludedFeatures.length === 0 || contract.excludedFeatures.some((feature) => !feature.trim())) issues.push('Explicitly document excluded features and sensitive attributes.')
  if (contract.splitStrategy.trim().length < 8) issues.push('A reproducible train/validation/test split strategy is required.')
  if (contract.leakageChecks.length === 0 || contract.leakageChecks.some((check) => !check.trim())) issues.push('At least one non-empty target-leakage check is required.')
  if (contract.evaluationMetrics.length === 0 || contract.evaluationMetrics.some((metric) => !metric.trim())) issues.push('At least one task-appropriate evaluation metric is required.')
  if (contract.subgroupEvaluation.length === 0 || contract.subgroupEvaluation.some((evaluation) => !evaluation.trim())) issues.push('Subgroup performance and fairness evaluation must be documented.')
  if (contract.humanReview.trim().length < 8) issues.push('A human review and appeal path is required.')
  if (contract.retentionPolicy.trim().length < 8) issues.push('A data retention and deletion policy is required.')
  return issues
}

export function isTrainingContractComplete(contract: TrainingContract): boolean {
  return validateTrainingContract(contract).length === 0
}

export type InternshipRecommendationProfile = {
  skills: string[]
  interests: string[]
  branch: string | null
  graduationYear: number | null
  cgpa: number | null
}

export type InternshipRecommendationListing = {
  id: string
  title: string
  companyName: string
  location: string
  workMode: string
  description: string
  requiredSkills: string[]
  eligibility: {
    minCgpa?: number
    branches?: string[]
    graduationYears?: number[]
  } | null
  deadline: string | null
}

export type InternshipRecommendation = InternshipRecommendationListing & {
  score: number
  reasons: string[]
  method: 'transparent_rules_v1'
  modelTrained: false
}

export type RecommendationResponse = {
  task: 'internship_recommendation'
  available: true
  lifecycle: 'rules_based'
  trainedModelUsed: false
  disclaimer: string
  recommendations: InternshipRecommendation[]
}

export function normalizeTerms(values: string[]): Set<string> {
  return new Set(values.map((value) => value.trim().toLocaleLowerCase()).filter(Boolean))
}

export function matchesAnyTerm(text: string, terms: Set<string>): string[] {
  const normalized = text.toLocaleLowerCase()
  return [...terms].filter((term) => normalized.includes(term))
}

export function isEligibleForListing(
  profile: InternshipRecommendationProfile,
  listing: InternshipRecommendationListing,
): boolean {
  const eligibility = listing.eligibility ?? {}
  if (eligibility.minCgpa !== undefined && (profile.cgpa === null || profile.cgpa < eligibility.minCgpa)) return false
  if (eligibility.branches?.length && (!profile.branch || !eligibility.branches.some((branch) => branch.toLocaleLowerCase() === profile.branch?.toLocaleLowerCase()))) return false
  if (eligibility.graduationYears?.length && (!profile.graduationYear || !eligibility.graduationYears.includes(profile.graduationYear))) return false
  return true
}

export function isListingOpen(deadline: string | null, today = new Date()): boolean {
  if (!deadline) return true
  const parsed = new Date(`${deadline}T23:59:59.999Z`)
  return Number.isFinite(parsed.getTime()) && parsed >= today
}

export function recommendInternships(
  profile: InternshipRecommendationProfile,
  listings: InternshipRecommendationListing[],
  appliedListingIds: ReadonlySet<string> = new Set(),
  today = new Date(),
): RecommendationResponse {
  const studentSkills = normalizeTerms(profile.skills)
  const studentInterests = normalizeTerms(profile.interests)

  const recommendations = listings
    .filter((listing) => !appliedListingIds.has(listing.id))
    .filter((listing) => isEligibleForListing(profile, listing))
    .filter((listing) => isListingOpen(listing.deadline, today))
    .map((listing) => {
      const requiredSkills = normalizeTerms(listing.requiredSkills)
      const matchedSkills = [...requiredSkills].filter((skill) => studentSkills.has(skill))
      const matchedInterests = matchesAnyTerm(`${listing.title} ${listing.description}`, studentInterests)
      const score = requiredSkills.size > 0
        ? Math.round((matchedSkills.length / requiredSkills.size) * 80 + Math.min(matchedInterests.length * 5, 20))
        : Math.min(matchedInterests.length * 10, 20)
      const reasons = [
        matchedSkills.length ? `Matches ${matchedSkills.length} of ${requiredSkills.size} listed skills: ${matchedSkills.join(', ')}.` : null,
        matchedInterests.length ? `Related to your interests: ${matchedInterests.join(', ')}.` : null,
        requiredSkills.size === 0 && matchedInterests.length === 0 ? 'No required-skill or interest signals were listed; shown without a relevance signal.' : null,
      ].filter((reason): reason is string => reason !== null)

      return { ...listing, score, reasons, method: 'transparent_rules_v1' as const, modelTrained: false as const }
    })
    .sort((a, b) => b.score - a.score || a.title.localeCompare(b.title))

  return {
    task: 'internship_recommendation',
    available: true,
    lifecycle: 'rules_based',
    trainedModelUsed: false,
    disclaimer: 'These are explainable skill-and-interest matches, not AI predictions or hiring decisions. Eligibility is applied only from the listing criteria provided.',
    recommendations,
  }
}

export const modelServiceCapabilities: ServiceCapability[] = [
  {
    task: 'internship_recommendation',
    displayName: 'Internship matching',
    lifecycle: 'rules_based',
    isTrained: false,
    isDeployed: true,
    description: 'Deterministic ranking by exact skill overlap and declared interests.',
    limitation: 'Not a trained model; not an employment decision or prediction.',
    trainingContractRequired: false,
  },
  {
    task: 'resume_parsing',
    displayName: 'Resume parsing',
    lifecycle: 'not_trained',
    isTrained: false,
    isDeployed: false,
    description: 'Structured extraction from resumes.',
    limitation: 'Unavailable until parser validation, artifact provenance, and privacy review are complete.',
    trainingContractRequired: true,
  },
  {
    task: 'salary_prediction',
    displayName: 'Salary prediction',
    lifecycle: 'not_trained',
    isTrained: false,
    isDeployed: false,
    description: 'Compensation range estimation.',
    limitation: 'Unavailable without a representative, approved compensation dataset and evaluation.',
    trainingContractRequired: true,
  },
  {
    task: 'fairness_audit',
    displayName: 'Fairness audit',
    lifecycle: 'not_trained',
    isTrained: false,
    isDeployed: false,
    description: 'Subgroup performance and outcome disparity measurement.',
    limitation: 'Unavailable without authorized labeled outcomes and a documented audit protocol; never infers protected attributes.',
    trainingContractRequired: true,
  },
]
