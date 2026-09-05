// entitlements.ts — the read-only "is this person entitled to this
// business's dashboard" check. Implements ADR-001 Decision 2/3: an
// active row in that business's OWN staff_user table for this exact
// google_email. No fourth user/role table; no interpretation of what
// a role can DO inside a business — that's each dashboard's own
// concern.
import { query } from './db';
import { BUSINESSES, confirmedBusinesses } from './businesses';

export interface Grant {
  business: string;
  role: string;
}

// staffTable is never user input — it always comes from the fixed
// BUSINESSES config in businesses.ts, so building the query string
// with it is not an injection risk. If that ever changes (e.g.
// business config becomes DB-driven), this must become parameterized
// differently.
async function activeStaffRow(staffTable: string, googleEmail: string): Promise<{ role: string } | null> {
  try {
    const rows = await query<{ role: string }>(
      `SELECT role::text AS role FROM ${staffTable} WHERE google_email = $1 AND active = true`,
      [googleEmail]
    );
    return rows[0] ?? null;
  } catch (err: any) {
    // Defense-in-depth: a business whose staff table gets
    // dropped/renamed mid-migration, OR whose shell_app grant hasn't
    // landed yet (real bug hit 2026-09-05: elektrica.staff_user existed
    // but shell_app's GRANT was never re-applied after the table landed,
    // which surfaced as an uncaught "permission denied" that failed
    // login for ALL businesses, not just Elektrica's), degrades to "no
    // entitlement for this business" instead of a hard 500 for everyone.
    // Any other DB error still surfaces normally via query().
    if (err?.code === '42P01' /* undefined_table */ || err?.code === '42501' /* insufficient_privilege */) {
      return null;
    }
    throw err;
  }
}

/**
 * All grants this google_email currently holds, across every
 * confirmed business (domain match is the caller's job before calling
 * this — see auth.ts). Read-only, re-run on every login and can be
 * re-run per-request by dashboard backends per the JWT contract
 * (fail-closed re-check, not trust-the-JWT).
 */
export async function grantsForEmail(googleEmail: string): Promise<Grant[]> {
  const grants: Grant[] = [];
  for (const b of BUSINESSES) {
    const row = await activeStaffRow(b.staffTable, googleEmail);
    if (row) {
      grants.push({ business: b.business, role: row.role });
    }
  }
  return grants;
}

/** Dashboards the launcher should show doors for: confirmed domain AND an active grant. */
export async function launcherDoors(googleEmail: string, grants: Grant[]) {
  const confirmed = confirmedBusinesses();
  return confirmed
    .filter((b) => grants.some((g) => g.business === b.business))
    .map((b) => ({ business: b.business, label: b.label, role: grants.find((g) => g.business === b.business)!.role }));
}
