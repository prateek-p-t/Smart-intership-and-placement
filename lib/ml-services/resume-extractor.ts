import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import syntheticDataset from './data/synthetic-resume-extraction-v1.json' with { type: 'json' }

const MAX_TEXT = 80_000
const MAX_PAGES = 40
const SKILLS = ['python', 'java', 'javascript', 'typescript', 'sql', 'postgresql', 'mysql', 'mongodb', 'react', 'next.js', 'node.js', 'fastapi', 'django', 'flask', 'machine learning', 'deep learning', 'pytorch', 'tensorflow', 'scikit-learn', 'pandas', 'numpy', 'aws', 'azure', 'gcp', 'docker', 'kubernetes', 'git', 'figma', 'excel', 'power bi', 'tableau', 'c++', 'c#', 'go', 'rust', 'html', 'css', 'tailwind', 'redis', 'linux', 'rest api'] as const
const SECTION_VARIANTS: Record<string, string[]> = {
  education: ['education', 'academic background', 'academics', 'education and training', 'qualifications'],
  experience: ['experience', 'work experience', 'professional experience', 'employment history', 'internship experience'],
  projects: ['projects', 'selected projects', 'academic projects', 'personal projects', 'project experience'],
  certifications: ['certifications', 'certificates', 'licenses and certifications', 'professional certificates'],
  skills: ['skills', 'technical skills', 'core competencies', 'technical expertise', 'tools and technologies'],
}

type Example = { text: string; label: string }
type Model = { labels: string[]; vocabularySize: number; documents: Map<string, number>; tokens: Map<string, Map<string, number>>; totals: Map<string, number> }

function features(text: string) {
  const normalized = text.toLocaleLowerCase().replace(/[^a-z0-9+#.\s]/g, ' ').replace(/\s+/g, ' ').trim()
  const result = new Set<string>()
  for (const word of normalized.split(' ')) if (word) result.add(`w:${word}`)
  const padded = ` ${normalized} `
  for (let size = 2; size <= 4; size += 1) {
    for (let start = 0; start <= padded.length - size; start += 1) {
      const gram = padded.slice(start, start + size).trim()
      if (gram.length >= 2) result.add(`c:${gram}`)
    }
  }
  return result
}

function train(examples: Example[]): Model {
  const documents = new Map<string, number>()
  const tokens = new Map<string, Map<string, number>>()
  const totals = new Map<string, number>()
  const vocabulary = new Set<string>()
  for (const example of examples) {
    const sample = features(example.text)
    documents.set(example.label, (documents.get(example.label) ?? 0) + 1)
    const labelTokens = tokens.get(example.label) ?? new Map<string, number>()
    for (const token of sample) {
      vocabulary.add(token)
      labelTokens.set(token, (labelTokens.get(token) ?? 0) + 1)
    }
    tokens.set(example.label, labelTokens)
    totals.set(example.label, (totals.get(example.label) ?? 0) + sample.size)
  }
  return { labels: [...documents.keys()], vocabularySize: vocabulary.size, documents, tokens, totals }
}

function predict(model: Model, text: string) {
  const sample = features(text)
  const documentTotal = [...model.documents.values()].reduce((sum, value) => sum + value, 0)
  const scores = new Map<string, number>()
  for (const label of model.labels) {
    const counts = model.tokens.get(label) ?? new Map<string, number>()
    const total = model.totals.get(label) ?? 0
    let score = Math.log((model.documents.get(label) ?? 0) / documentTotal)
    for (const token of sample) score += Math.log(((counts.get(token) ?? 0) + 1) / (total + model.vocabularySize))
    scores.set(label, score)
  }
  const max = Math.max(...scores.values())
  const exponentials = [...scores].map(([label, score]) => [label, Math.exp(score - max)] as const)
  const denominator = exponentials.reduce((sum, [, value]) => sum + value, 0)
  return new Map(exponentials.map(([label, value]) => [label, value / denominator]))
}

function normalizeHeading(text: string) {
  return text.toLocaleLowerCase().replace(/[^a-z0-9 ]/g, ' ').trim().split(' ').filter(Boolean).join(' ')
}

function findSkillMentions(text: string) {
  const normalized = text.toLocaleLowerCase()
  const boundaryCharacter = /[a-z0-9_+#.]/i
  return SKILLS.filter((skill) => {
    let start = normalized.indexOf(skill)
    while (start >= 0) {
      const before = normalized[start - 1] ?? ''
      const after = normalized[start + skill.length] ?? ''
      if ((!before || !boundaryCharacter.test(before)) && (!after || !boundaryCharacter.test(after))) return true
      start = normalized.indexOf(skill, start + 1)
    }
    return false
  })
}

function buildHeadingExamples(): Example[] {
  const examples: Example[] = []
  for (const [label, variants] of Object.entries(SECTION_VARIANTS)) {
    for (const variant of variants) {
      for (const text of [variant, variant.toUpperCase(), `${variant}:`, `— ${variant} —`, `${variant} |`]) examples.push({ text, label })
    }
  }
  for (const record of syntheticDataset.records) {
    const expected = new Set(record.extraction.sectionHeadingsPresent)
    for (const line of record.text.split('\n')) {
      const normalized = normalizeHeading(line)
      const matched = Object.entries(SECTION_VARIANTS).find(([label, variants]) => expected.has(label) && variants.some((variant) => normalizeHeading(variant) === normalized))
      if (matched) examples.push({ text: line, label: matched[0] })
    }
  }
  for (const text of ['software engineer', 'computer science student', 'class of 2026', 'about me', 'profile', 'contact', 'references available on request', 'built a web application using python', 'responsible for project delivery', 'currently learning machine learning']) examples.push({ text, label: 'other' })
  return examples
}

function buildSkillExamples(): Example[] {
  const pairs = [['python', 'sql'], ['react', 'typescript'], ['java', 'spring boot'], ['docker', 'kubernetes'], ['pandas', 'numpy'], ['aws', 'linux'], ['figma', 'html'], ['c++', 'git']]
  const positive = ['Skills: {skills}', 'Technical skills | {skills}', '{skills}', 'Built a project using {skills}', 'Developed features with {skills}', 'Tools and technologies: {skills}', 'Applied {skills} to deliver project work', 'Hands-on experience with {skills}']
  const negative = ['Interested in learning {skills}', 'Planning to study {skills} next semester', 'Read an article about {skills}', 'Attended a talk about {skills}', 'The role description mentions {skills}', 'My friend works with {skills}', 'Want to explore {skills} in the future', 'Course catalog: introduction to {skills}']
  const examples: Example[] = []
  for (const pair of pairs) {
    const skills = pair.join(', ')
    for (const text of positive) examples.push({ text: text.replace('{skills}', skills), label: 'skill_evidence' })
    for (const text of negative) examples.push({ text: text.replace('{skills}', skills), label: 'other' })
  }
  for (const record of syntheticDataset.records) {
    const expected = new Set(record.extraction.skills)
    for (const line of record.text.split('\n')) {
      const matches = findSkillMentions(line)
      if (matches.length) examples.push({ text: line, label: matches.every((skill) => expected.has(skill)) ? 'skill_evidence' : 'other' })
    }
  }
  return examples
}

const headingExamples = buildHeadingExamples()
const skillExamples = buildSkillExamples()
const headingModel = train(headingExamples)
const skillModel = train(skillExamples)
const trainingExamples = headingExamples.length + skillExamples.length

function headingFor(line: string) {
  if (line.length > 90 || line.split(/\s+/).length > 9) return null
  const scores = [...predict(headingModel, line)].sort((first, second) => second[1] - first[1])
  const top = scores[0]
  return top && top[0] !== 'other' && top[1] >= 0.54 ? top[0] : null
}

function extractTextFields(text: string) {
  const skills = new Set<string>()
  const evidenceScores: number[] = []
  const headings = new Set<string>()
  let activeSection = ''
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line) continue
    const matches = findSkillMentions(line)
    const heading = matches.length ? null : headingFor(line)
    if (heading) {
      headings.add(heading)
      activeSection = heading
      continue
    }
    if (!matches.length) continue
    const evidence = predict(skillModel, line).get('skill_evidence') ?? 0
    const sectionSupportsSkill = ['skills', 'experience', 'projects'].includes(activeSection)
    const ambiguous = matches.some((skill) => ['go', 'c', 'java'].includes(skill))
    if ((!ambiguous && evidence >= 0.48) || sectionSupportsSkill) {
      for (const skill of matches) skills.add(skill)
      evidenceScores.push(Math.max(evidence, sectionSupportsSkill ? 0.72 : 0))
    }
  }
  const meanSkillScore = evidenceScores.length ? evidenceScores.reduce((sum, value) => sum + value, 0) / evidenceScores.length : 0
  const emails = [...new Set(text.match(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi) ?? [])].map((email) => email.toLocaleLowerCase()).slice(0, 10)
  const phones = [...new Set(text.match(/(?<!\d)(?:\+?\d[\d ()-]{7,}\d)(?!\d)/g) ?? [])].slice(0, 10)
  const label = (value: number): 'low' | 'medium' | 'high' => value >= 0.82 ? 'high' : value >= 0.62 ? 'medium' : 'low'
  return {
    skills: [...skills].sort(),
    emailAddresses: emails,
    phoneNumbers: phones,
    sectionHeadingsPresent: [...headings],
    textCharacters: text.length,
    confidence: { skills: label(meanSkillScore), contactDetails: label(emails.length && phones.length ? 0.9 : emails.length || phones.length ? 0.68 : 0) },
  }
}

export async function extractResumePdf(fileBytes: Uint8Array) {
  const loadingTask = getDocument({ data: fileBytes, useSystemFonts: true })
  const pdf = await loadingTask.promise
  try {
    if (pdf.numPages > MAX_PAGES) throw new Error('This PDF has too many pages to analyze. Please upload a resume with 40 pages or fewer.')
    const pages: string[] = []
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber)
      const content = await page.getTextContent()
      let line = ''
      const lines: string[] = []
      for (const item of content.items) {
        if (!('str' in item) || typeof item.str !== 'string') continue
        line += `${item.str} `
        if ('hasEOL' in item && item.hasEOL) {
          lines.push(line.trim())
          line = ''
        }
      }
      if (line.trim()) lines.push(line.trim())
      pages.push(lines.join('\n'))
      if (pages.join('\n').length > MAX_TEXT) throw new Error('This resume contains too much text to analyze.')
    }
    const text = pages.join('\n')
    if (!text.trim()) throw new Error('No readable text was found. Scanned or image-only PDFs need OCR and cannot be analyzed yet.')
    const fields = extractTextFields(text)
    return {
      task: 'resume_parsing', available: true, lifecycle: 'experimental', modelTrained: true,
      model: 'synthetic-naive-bayes-resume-extractor-v1', trainingDataset: 'synthetic-resume-extraction-v1',
      trainingDatasetUrl: '/datasets/synthetic-resume-extraction-v1.json', trainingExamples, sourceFormat: 'pdf', extraction: {
        skills: fields.skills, emailAddresses: fields.emailAddresses, phoneNumbers: fields.phoneNumbers,
        sectionHeadingsPresent: fields.sectionHeadingsPresent, textCharacters: fields.textCharacters,
      }, confidence: fields.confidence,
      limitations: [
        'Trained on synthetic examples only; not validated against real resumes.',
        'Confidence labels are heuristic and uncalibrated. Verify every field.',
        'Contact details use pattern matching; scanned/image-only PDFs require OCR and are unsupported.',
      ],
    }
  } finally {
    await loadingTask.destroy()
  }
}

export function extractResumeTextForTesting(text: string) {
  return extractTextFields(text)
}

export const resumeExtractorTrainingInfo = { dataset: 'synthetic-resume-extraction-v1', examples: trainingExamples }
