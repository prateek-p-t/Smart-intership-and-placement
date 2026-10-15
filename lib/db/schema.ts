import { bigint, boolean, date, integer, jsonb, numeric, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core'
import type { CareerRoadmapMilestone } from '../portal/roadmap-types'

export const user = pgTable('user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('emailVerified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const session = pgTable('session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expiresAt').notNull(),
  token: text('token').notNull().unique(),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
  ipAddress: text('ipAddress'),
  userAgent: text('userAgent'),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
})

export const account = pgTable('account', {
  id: text('id').primaryKey(),
  accountId: text('accountId').notNull(),
  providerId: text('providerId').notNull(),
  userId: text('userId').notNull().references(() => user.id, { onDelete: 'cascade' }),
  accessToken: text('accessToken'),
  refreshToken: text('refreshToken'),
  idToken: text('idToken'),
  accessTokenExpiresAt: timestamp('accessTokenExpiresAt'),
  refreshTokenExpiresAt: timestamp('refreshTokenExpiresAt'),
  scope: text('scope'),
  password: text('password'),
  createdAt: timestamp('createdAt').notNull().defaultNow(),
  updatedAt: timestamp('updatedAt').notNull().defaultNow(),
})

export const verification = pgTable('verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expiresAt').notNull(),
  createdAt: timestamp('createdAt').defaultNow(),
  updatedAt: timestamp('updatedAt').defaultNow(),
})

export const portalProfiles = pgTable('portal_profiles', {
  userId: text('userId').primaryKey().references(() => user.id, { onDelete: 'cascade' }),
  role: text('role').notNull().default('student'),
  headline: text('headline'),
  institution: text('institution'),
  graduationYear: integer('graduation_year'),
  branch: text('branch'),
  cgpa: numeric('cgpa', { precision: 4, scale: 2 }),
  skills: jsonb('skills').$type<string[]>().notNull().default([]),
  interests: jsonb('interests').$type<string[]>().notNull().default([]),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const internships = pgTable('internships', {
  id: text('id').primaryKey(),
  ownerUserId: text('owner_user_id').notNull(),
  companyName: text('company_name').notNull(),
  title: text('title').notNull(),
  location: text('location').notNull(),
  workMode: text('work_mode').notNull().default('Hybrid'),
  stipendMin: integer('stipend_min'),
  stipendMax: integer('stipend_max'),
  description: text('description').notNull(),
  requiredSkills: jsonb('required_skills').$type<string[]>().notNull().default([]),
  eligibility: jsonb('eligibility').$type<{ minCgpa?: number; branches?: string[]; graduationYears?: number[] }>().notNull().default({}),
  status: text('status').notNull().default('draft'),
  deadline: date('deadline'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
})

export const applications = pgTable('applications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  internshipId: text('internship_id').notNull(),
  status: text('status').notNull().default('submitted'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [uniqueIndex('applications_user_id_internship_id_key').on(table.userId, table.internshipId)])

export const facultyStudentAssignments = pgTable('faculty_student_assignments', {
  facultyUserId: text('faculty_user_id').notNull(),
  studentUserId: text('student_user_id').notNull(),
  assignedByUserId: text('assigned_by_user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
}, (table) => [primaryKey({ columns: [table.facultyUserId, table.studentUserId], name: 'faculty_student_assignments_pkey' })])

export const resumeMetadata = pgTable('resume_metadata', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  storageKey: text('storage_key').notNull().unique(),
  originalName: text('original_name').notNull(),
  mediaType: text('media_type').notNull(),
  byteSize: bigint('byte_size', { mode: 'number' }).notNull(),
  sha256: text('sha256'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const notifications = pgTable('notifications', {
  id: text('id').primaryKey(),
  userId: text('user_id').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const auditLogs = pgTable('audit_logs', {
  id: text('id').primaryKey(),
  actorUserId: text('actor_user_id'),
  action: text('action').notNull(),
  resourceType: text('resource_type').notNull(),
  resourceId: text('resource_id'),
  requestId: text('request_id'),
  metadata: jsonb('metadata').notNull().default({}),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const mlModelRegistry = pgTable('ml_model_registry', {
  id: text('id').primaryKey(),
  modelName: text('model_name').notNull(),
  task: text('task').notNull(),
  version: text('version').notNull(),
  artifactLocation: text('artifact_location'),
  datasetVersion: text('dataset_version'),
  trainingStatus: text('training_status').notNull().default('not_trained'),
  evaluationMetrics: jsonb('evaluation_metrics').notNull().default({}),
  trainedAt: timestamp('trained_at', { withTimezone: true }),
  approvalStatus: text('approval_status').notNull().default('experimental'),
  deploymentStatus: text('deployment_status').notNull().default('offline'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})

export const profileRoleNames = ['student', 'company_recruiter', 'faculty', 'placement_officer', 'administrator'] as const
export type PortalRole = (typeof profileRoleNames)[number]
export type InternshipEligibility = { minCgpa?: number; branches?: string[]; graduationYears?: number[] }
