// businesses.ts — the domain -> business -> staff table mapping.
//
// Per ADR-001 Decision 4: a small static config, not a new
// platform.business table, since there are only three businesses
// today. DELIBERATELY incomplete: only vlslawfirm.com is confirmed
// from anything read so far. Collision's and Elektrica's actual
// Google Workspace domains have NOT been provided yet (hermes,
// 2026-09-04: "I don't have Complete Collision's or Elektrica's
// actual Google Workspace domain strings confirmed either... I'll
// get these from Jed directly and relay them"). Guessing at these
// would repeat exactly the mistake Complete Collision's own migration
// 004 explicitly declined to make. DO NOT fill these in from
// assumption — wait for hermes to relay the confirmed strings.
//
// Elektrica's staff_user table now exists (hermes, 2026-09-05:
// "elektrica.staff_user now exists — just built, verified live.
// Schema: person_id FK, role enum (currently owner/staff placeholder
// — not yet Jed-confirmed), google_email, active flag,
// provisioned_by_staff_user_id. Same shape as vls.staff_user /
// collision.staff_user"). This mechanism already generalizes to it
// without changes — entitlements.ts only ever checks "does an active
// row exist," never a specific role value, so the placeholder
// owner/staff role names are safe to pass through as-is (see
// entitlements.ts Grant.role — just a string, never branched on).
// Elektrica's domain is still `null` below though (Open Question 3,
// still unconfirmed) — confirmedBusinesses() will keep hiding its
// door from the launcher until hermes relays a real domain, which is
// still correct: table existing and domain being confirmed are two
// separate gates.

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
    domain: null, // TBD — awaiting confirmed domain from hermes/Jed.
    staffTable: 'collision.staff_user',
    label: 'Complete Collision Dashboard',
  },
  {
    business: 'elektrica',
    domain: null, // TBD — awaiting confirmed domain from hermes/Jed.
    staffTable: 'elektrica.staff_user', // exists now (hermes, 2026-09-05); domain still unconfirmed, see module comment above.
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
