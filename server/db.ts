import { Pool } from 'pg'
import { env, hasDatabase } from './env.ts'

export const pool = hasDatabase()
  ? new Pool({
      connectionString: env.databaseUrl,
      ssl: env.databaseUrl.includes('localhost') ? undefined : { rejectUnauthorized: false },
    })
  : null
