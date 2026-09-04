// db.ts — thin Postgres pool wrapper. The shell's DB role is scoped to
// SELECT-only on platform.person + each business's staff_user table
// (see docs/ADR-001-shell-architecture.md, Decision 2 and Open
// Question 6). This file does not enforce that — the GRANT does, at
// the DB layer, on the shell_app role itself. Nothing here should ever
// need to touch vls.case, vls.client, collision.job, collision.customer,
// elektrica.rental, or any other case/customer/financial table — if a
// future change adds a query against one of those, that is a scope
// violation per SOUL.md and should be caught in review before merge,
// not just relying on the GRANT to fail loudly in production.
import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error('DATABASE_URL is not set.');
}

export const pool = new Pool({
  connectionString: DATABASE_URL,
  max: 5,
});

export async function query<T = any>(text: string, params: any[] = []): Promise<T[]> {
  const result = await pool.query(text, params);
  return result.rows as T[];
}
