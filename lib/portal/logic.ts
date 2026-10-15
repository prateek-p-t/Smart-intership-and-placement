import type { InternshipEligibility } from '@/lib/db/schema'

export function normalizeSkill(value: string) {
  return value.trim().toLocaleLowerCase().replace(/\s+/g, ' ')
}

export function explainSkillFit(studentSkills: string[], requiredSkills: string[]) {
  const available = new Set(studentSkills.map(normalizeSkill))
  const matched = requiredSkills.filter((skill) => available.has(normalizeSkill(skill)))
  const missing = requiredSkills.filter((skill) => !available.has(normalizeSkill(skill)))
  const score = requiredSkills.length ? Math.round((matched.length / requiredSkills.length) * 100) : null
  return { matched, missing, score }
}

export function checkEligibility(
  student: { cgpa: string | null; branch: string | null; graduationYear: number | null },
  criteria: InternshipEligibility,
) {
  const checks: { label: string; passed: boolean; applicable: boolean }[] = []
  if (criteria.minCgpa !== undefined) checks.push({ label: `Minimum CGPA ${criteria.minCgpa}`, applicable: true, passed: student.cgpa !== null && Number(student.cgpa) >= criteria.minCgpa })
  if (criteria.branches?.length) checks.push({ label: 'Eligible degree branch', applicable: true, passed: Boolean(student.branch && criteria.branches.some((branch) => normalizeSkill(branch) === normalizeSkill(student.branch!))) })
  if (criteria.graduationYears?.length) checks.push({ label: 'Eligible graduation year', applicable: true, passed: Boolean(student.graduationYear && criteria.graduationYears.includes(student.graduationYear)) })
  const applicable = checks.filter((check) => check.applicable)
  return { checks, eligible: applicable.length === 0 || applicable.every((check) => check.passed), criteriaCount: applicable.length }
}

export function displayRole(role: string) {
  const names: Record<string, string> = {
    student: 'Student',
    company_recruiter: 'Company recruiter',
    faculty: 'Faculty',
    placement_officer: 'Placement officer',
    administrator: 'Administrator',
  }
  return names[role] ?? 'Student'
}

export function initials(name: string) {
  return name.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || 'P'
}
