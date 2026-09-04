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
// Elektrica also has no staff_user table yet in elektrica-dashboard
// (ADR-001 Open Question 2) — its entry below is present so the shape
// is ready, but querying it will simply find no active row for anyone
// until that table exists. The launcher will correctly show no
// Elektrica door in the meantime, which is the intended behavior, not
// a bug to work around.

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
    staffTable: 'elektrica.staff_user', // does not exist yet; see module comment above.
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
