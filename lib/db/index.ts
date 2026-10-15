import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import * as schema from './schema'

type DatabaseGlobal = typeof globalThis & { pathwayDatabasePool?: Pool }
const databaseGlobal = globalThis as DatabaseGlobal

export const pool = databaseGlobal.pathwayDatabasePool ?? new Pool({
  connectionString: process.env.DATABASE_URL,
  max: process.env.NODE_ENV === 'production' ? 5 : 10,
  idleTimeoutMillis: 30_000,
  connectionTimeoutMillis: 10_000,
})

if (process.env.NODE_ENV !== 'production') databaseGlobal.pathwayDatabasePool = pool

export const db = drizzle(pool, { schema })
