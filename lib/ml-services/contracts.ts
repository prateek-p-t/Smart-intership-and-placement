export type ModelLifecycle = 'rules_based' | 'not_trained' | 'experimental' | 'approved' | 'offline'
export type ModelTask =
  | 'resume_parsing'
  | 'internship_recommendation'
  | 'job_candidate_matching'
  | 'placement_prediction'
  | 'eligibility_engine'
  | 'resume_ranking'
  | 'salary_prediction'
  | 'skill_gap_analysis'
  | 'interview_assistant'
  | 'knowledge_chatbot'
  | 'resume_classification'
  | 'fraud_duplicate_detection'
  | 'fairness_audit'

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
  { task: 'resume_parsing', displayName: 'Resume parsing and skill extraction', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Private document text extraction with structured, confidence-labeled fields.', limitation: 'Scanned PDFs require OCR; extracted skills and contact details must be reviewed by the student.', trainingContractRequired: false },
  { task: 'internship_recommendation', displayName: 'Internship recommendation', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Explainable ranking by exact skill overlap, interests, and published eligibility.', limitation: 'A transparent baseline only; not a trained model or hiring decision.', trainingContractRequired: false },
  { task: 'job_candidate_matching', displayName: 'Job and candidate matching', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Feature-level comparison of stated job requirements and candidate profile.', limitation: 'Similarity is not proof of qualification; human review is required.', trainingContractRequired: false },
  { task: 'placement_prediction', displayName: 'Placement prediction', lifecycle: 'not_trained', isTrained: false, isDeployed: false, description: 'Calibrated placement outcome estimates from authorized historical data.', limitation: 'No approved dataset or evaluated artifact is available; no probability is returned.', trainingContractRequired: true },
  { task: 'eligibility_engine', displayName: 'Eligibility rules engine', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Auditable checks against explicit CGPA, branch, graduation-year, and skill requirements.', limitation: 'Only supplied criteria are evaluated; missing profile data does not satisfy a requirement.', trainingContractRequired: false },
  { task: 'resume_ranking', displayName: 'Resume ranking', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Explainable baseline ranking using job-related skills and verified experience only.', limitation: 'Baseline relevance ordering only; protected characteristics are excluded and humans decide.', trainingContractRequired: false },
  { task: 'salary_prediction', displayName: 'Salary and stipend estimation', lifecycle: 'not_trained', isTrained: false, isDeployed: false, description: 'Indicative compensation range from representative historical offers.', limitation: 'No approved compensation dataset or evaluated artifact is available.', trainingContractRequired: true },
  { task: 'skill_gap_analysis', displayName: 'Skill-gap analysis', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Compares stated skills with role requirements and prioritizes missing skills.', limitation: 'A listed skill is not evidence of verified proficiency.', trainingContractRequired: false },
  { task: 'interview_assistant', displayName: 'Interview practice assistant', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Role-specific practice prompts and transparent rubric-based feedback.', limitation: 'Practice feedback is not a hiring assessment or validated psychometric score.', trainingContractRequired: false },
  { task: 'knowledge_chatbot', displayName: 'Placement knowledge assistant', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Retrieves relevant snippets from caller-authorized documents with source references.', limitation: 'The caller must filter documents by the current user’s permissions; no unsupported answer is generated.', trainingContractRequired: false },
  { task: 'resume_classification', displayName: 'Resume classification', lifecycle: 'not_trained', isTrained: false, isDeployed: false, description: 'Supervised job-family classification from labeled resume text.', limitation: 'Unavailable until a representative labeled dataset and macro-F1 evaluation are approved.', trainingContractRequired: true },
  { task: 'fraud_duplicate_detection', displayName: 'Duplicate and anomaly review', lifecycle: 'rules_based', isTrained: false, isDeployed: true, description: 'Exact file-hash duplicate checks and conservative near-duplicate review flags.', limitation: 'Flags require human review and never establish dishonesty.', trainingContractRequired: false },
  { task: 'fairness_audit', displayName: 'Fairness audit', lifecycle: 'not_trained', isTrained: false, isDeployed: false, description: 'Subgroup performance and outcome disparity measurement.', limitation: 'Requires authorized labeled outcomes and a documented audit protocol; never infers protected attributes.', trainingContractRequired: true },
]
