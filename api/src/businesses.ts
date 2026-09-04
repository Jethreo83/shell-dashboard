// businesses.ts — the domain -> business -> staff table mapping.
//
// Per ADR-001 Decision 4: a small static config, not a new
// platform.business table, since there are only three businesses
// today. All three domains are now confirmed by Jed (relayed by
// hermes, 2026-09-05):
//   - VLS: vlslawfirm.com
//   - Complete Collision: completecollisions.com
//   - Elektrica: elektricarentals.com
// Before this, Collision's and Elektrica's domains sat as `null` on
// purpose (ADR-001 Open Question 3) rather than guessed at — same
// discipline Complete Collision's own migration 004 applied to
// itself. Now that Jed has confirmed them directly, filling them in
// is no longer a guess.
//
// Elektrica's staff_user table exists (hermes, 2026-09-05) with role
// enum owner/staff, now confirmed FINAL by Jed (2026-09-05) — no
// further change coming. This mechanism already generalizes to it
// without code changes regardless — entitlements.ts only ever checks
// "does an active row exist," never a specific role value, so the
// owner/staff role names are safe to pass through as-is whether
// placeholder or final (see entitlements.ts Grant.role — just a
// string, never branched on).
//
// With all three domains confirmed, all three businesses' doors are
// now eligible to render in the launcher — confirmedBusinesses() no
// longer filters any of them out on domain grounds. Whether a
// specific person actually SEES a door still depends entirely on
// having an active row in that business's own staff_user table
// (entitlements.ts), unchanged.

export type BusinessKey = 'vls' | 'collision' | 'elektrica';

export interface BusinessConfig {
  business: BusinessKey;
  /** Google Workspace domain staff must sign in with. null = not yet confirmed; do not guess. */
  domain: string | null;
  /** schema.table holding this business's staff, keyed by google_email. */
  staffTable: string;
  /** Human label the launcher shows. */
  label: string;
}

export const BUSINESSES: BusinessConfig[] = [
  {
    business: 'vls',
    domain: 'vlslawfirm.com',
    staffTable: 'vls.staff_user',
    label: 'VLS Dashboard',
  },
  {
    business: 'collision',
    domain: 'completecollisions.com', // Confirmed by Jed via hermes, 2026-09-05.
    staffTable: 'collision.staff_user',
    label: 'Complete Collision Dashboard',
  },
  {
    business: 'elektrica',
    domain: 'elektricarentals.com', // Confirmed by Jed via hermes, 2026-09-05.
    staffTable: 'elektrica.staff_user',
    label: 'Elektrica Dashboard',
  },
];

/** Businesses whose domain has been confirmed and is safe to match logins against today. */
export function confirmedBusinesses(): BusinessConfig[] {
  return BUSINESSES.filter((b) => b.domain !== null);
}

export function businessForDomain(domain: string): BusinessConfig | undefined {
  return BUSINESSES.find((b) => b.domain === domain);
}
