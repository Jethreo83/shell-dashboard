# ADR-001 — Shell architecture: login, role-gating, launcher entitlement

Status: DRAFT — awaiting hermes/Jed review. Nothing in this ADR has been
built. No code, schema, or deploy exists yet for this repo beyond this
document.

## Context

Per `INSTRUCTION_Jocasta_parallel_build_2026-09-03.md` step 2: one login,
role-based doors, a launcher to each dashboard, and the shell is the
security boundary that will later protect the financials dashboard. Per
`SHARED_CONVENTIONS.md`, the shell does not get to invent a fourth
user/role table — it reads `platform.person` plus each project's own
staff/role table.

Current state of the three domain repos, read directly (public):

- **VLS** (`vls-dashboard`): schema-only, no app/API/frontend yet.
  `vls.staff_user` exists (migration 005, not yet read in full by me —
  only inferred from `api/src/auth.ts`): role enum
  `attorney | paralegal | admin`, keyed by `google_email`, `active`
  flag. Auth pattern (`web/src/auth.tsx` + `api/src/auth.ts`): Google
  Identity Services on the frontend → POST `id_token` to
  `/auth/google` → server verifies against Google, checks
  `email.endsWith('@vlslawfirm.com')`, looks up an active
  `vls.staff_user` row by email, issues a short-lived (8h) JWT carrying
  `{staff_user_id, google_email, role}`. `requireAuth` middleware
  re-checks `role`/`active` from the DB on **every** request (not just
  JWT decode) so a deactivation or role change takes effect immediately
  — this is the property I want the shell to preserve, generalized.

- **Complete Collision** (`complete-collision-dashboard`): schema-only.
  `collision.staff_user` (migration 004): role enum
  `owner | manager | receptionist`, keyed by `google_email`, `active`
  flag, admin-provisioned. `collision.staff_role_capability` (migration
  007) + `collision.staff_user_capability(email)` function: currently
  all three roles resolve to capability `'full'` per Jed's decision
  2026-09-04 — i.e. today the meaningful gate is "active staff member at
  all," not role. No backend/frontend exists yet to call this function.

- **Elektrica** (`elektrica-dashboard`): schema-only, and **no
  staff/role table exists at all yet**. `elektrica.renter` is the
  *customer* party table (like `vls.client`), not staff. This is a real
  gap for the shell — there is currently nothing to gate an Elektrica
  door against. See Open Question 2.

None of the three dashboards has a live backend or frontend yet, so the
shell is being designed ahead of anything it will actually launch into —
worth flagging since `SHARED_CONVENTIONS.md` itself says the shell is
"phase-two-early: build it once there are multiple dashboards worth
launching into, not before." Per hermes's direct instruction, I'm
producing the plan now anyway; I'm not writing app code until the
dashboards (and this ADR) are further along.

## Decision areas

### 1. Shell architecture (proposed)

Separate deployable (this repo): a thin frontend (login screen +
launcher grid) and a thin API. Reuse VLS's pattern almost directly,
generalized in two ways:

- **Multi-domain, not single-domain.** VLS hardcodes
  `@vlslawfirm.com`. The shell needs a small domain→business mapping
  (see Decision 4) so the same login screen serves all three
  businesses' Google Workspace domains.
- **Multi-grant JWT, not single-role JWT.** VLS's JWT carries one
  `role`. The shell's JWT should carry a `grants` array, since one
  person (Jed, at minimum) may be entitled to more than one dashboard:

  ```
  {
    person_id,
    google_email,
    grants: [
      { business: "vls", role: "attorney" },
      { business: "collision", role: "owner" }
    ],
    iat, exp
  }
  ```

- **Fail-closed re-check, not trust-the-JWT.** Like VLS's
  `requireAuth`, the shell's middleware re-derives `grants` from the DB
  on each request (or at minimum on each launcher render), not purely
  from the JWT payload — so a deactivation is immediate, not
  session-length-delayed.
- The launcher renders exactly one door per active grant. No grant, no
  door. This is the actual security boundary, not a client-side
  `if` — see Decision 4/Open Question 4 on why this needs to be
  enforced at the routing layer too, not just "don't render the
  button."

### 2. Role-gating across three separate schemas (concrete mechanism)

The shell does **not** get its own user/role table (per convention
#1's spirit — no fourth registry). It reads, read-only:

- `platform.person` — to resolve `google_email` to a `person_id`.
- `vls.staff_user` (id, google_email, role, active)
- `collision.staff_user` (id, google_email, role, active) +
  optionally `collision.staff_user_capability()` if capability-level
  (not just role) ever needs to feed the launcher
- `elektrica.staff_user` (id, google_email, role, active) — **once it
  exists**; it doesn't yet (Open Question 2)

Entitlement check per business = "does an active row exist in that
business's staff table for this `google_email`?" That boolean (plus
whatever role string comes back) is all the shell needs. The shell does
**not** need to understand what an "attorney" or "manager" can do
*inside* VLS or Collision — that's each dashboard's own app-layer
concern, now or once built. The shell's DB role (`shell_app`, name TBD)
should be granted `SELECT` on nothing but those staff tables' relevant
columns and on `platform.person` — no grant on `vls.case`,
`vls.client`, `collision.job`, `collision.customer`,
`elektrica.rental`, or any case/customer/financial content whatsoever.
This is the concrete form of "no relationship to case data" for this
bot: it's enforced by GRANT, not just by policy.

Each dashboard's own backend (once built) must **independently**
re-verify entitlement server-side rather than trusting "the shell
showed me the door" — same fail-closed principle VLS already applies
to itself. The shell is the first door; it is not the only lock.

### 3. What "entitled to a dashboard" concretely means

A person is entitled to business X's dashboard iff:

1. Their Google-verified email's domain matches business X's
   configured Google Workspace domain, **and**
2. An **active** row for that exact email exists in business X's own
   staff/party-with-role table (`vls.staff_user`,
   `collision.staff_user`, future `elektrica.staff_user`).

Not entitled: wrong domain, no row (never provisioned), or `active =
false` (deactivated). No self-signup anywhere — matches all three
existing patterns (admin-provisioned).

This is deliberately coarse — "can see the door" — not fine-grained
in-dashboard permission (e.g. Collision's role→capability mapping, or
financials being Jed-only specifically rather than
role-based-in-general). The shell's `grants` model is a list so a
future 4th grant type (e.g. `{business: "financials", role: "jed"}`,
once financials is actually built) slots in without restructuring the
JWT or launcher — but I am not building financials or its grant type
now; just noting the model needs the headroom.

### 4. Domain → business mapping

Propose a small static config in the shell (only 3 businesses known
today) rather than a new `platform.business` table:

```
vlslawfirm.com        -> business: vls,       staff table: vls.staff_user
<collision domain>    -> business: collision, staff table: collision.staff_user
<elektrica domain>    -> business: elektrica, staff table: elektrica.staff_user
```

I do not have Complete Collision's or Elektrica's actual Google
Workspace domain strings from anything I've read — I'm not guessing at
them (same discipline Collision's own migration 004 comment applies to
itself: "the actual domain string is not confirmed in any source
document... guessing would be exactly the kind of unconfirmed
assumption... not to bake into a promoted migration"). See Open
Question 3. If a 4th business ever appears, escalate to a real
`platform.business` config table then — not preemptively.

### 5. Financials boundary (forward-looking constraint only — not building)

Financials is explicitly phase-two hold. The only thing I'm deciding
now is that the shell's `grants` model must be able to carry a
narrowly-scoped, individually-provisioned grant type later (e.g. one
row, one person, no role-class) without a redesign — and that per
convention #6, no bot-driven write path may ever grant that entitlement
directly; at most a bot could *propose* it for a human to confirm. Not
building any of this yet; recording it so the later financials work
inherits a shell that was designed with the constraint in mind.

## Open questions (holding for hermes/Jed before any build)

1. **JWT/session trust model across shell + 3 dashboard APIs — the
   biggest fork, blocks everything else.** Does the shell issue one
   JWT that each dashboard's own API is expected to verify directly
   (meaning all four services need to agree on a shared secret/issuer
   convention), or does the shell act as a front door that hands off
   via redirect/exchange-token to each dashboard's *own* independent
   convention (more isolated, but is "one login" then actually true,
   or just "one login screen")? This determines almost everything else
   below.

2. **Elektrica has no staff/role table yet.** Unlike VLS (migration
   005) and Collision (migrations 004/007), there is nothing in
   `elektrica-dashboard` today to gate a door against. My working
   assumption: the shell's launcher simply omits Elektrica's door until
   that table exists — I am not going to build it on Elektrica's behalf
   (out of my scope, and out of my project lock). Confirm that's the
   right call, or should this be flagged to the Elektrica bot as a
   blocking dependency now?

   UPDATE 2026-09-05: RESOLVED — confirmed correct, and now fully
   moot: Elektrica's `staff_user` table exists, its role enum
   (`owner`/`staff`) is confirmed final by Jed (no further change
   coming), and its domain is confirmed (`elektricarentals.com`).
   Elektrica's door is fully wired — same as VLS and Collision, no
   special-casing left in the code.

3. **Actual Google Workspace domains for Collision and Elektrica** —
   needed to populate Decision 4's mapping. Only `vlslawfirm.com` is
   confirmed from what I've read.

   UPDATE 2026-09-05: RESOLVED — Jed confirmed all three directly
   (relayed by hermes): VLS `vlslawfirm.com`, Complete Collision
   `completecollisions.com`, Elektrica `elektricarentals.com`. All
   three filled into `api/src/businesses.ts`; no more `null` domains.
   Verified live against staging: `businessForDomain()` resolves all
   three correctly and rejects an unrelated domain; `/me` still
   returns the correct `vls` grant for a real active staff email
   afterward (no regression from the edit).

4. **Enforcement layer** — is "door doesn't appear" purely a launcher
   UI check (weaker — depends entirely on each dashboard also
   independently gating itself, which none of them can do yet since
   none has a backend), or does the shell also sit in front as a
   reverse proxy / routing gate that blocks unauthenticated navigation
   to a dashboard's URL directly? I'd lean toward the shell needing
   real routing-level enforcement (not just hiding a button) precisely
   because this is the boundary financials will depend on — but this
   is entangled with Question 1's answer and with each dashboard's own
   eventual deploy topology (same origin vs. separate subdomains).

5. **Logout-everywhere semantics** — if the shell is the SSO, does
   logging out of the shell invalidate dashboard-level sessions too?
   Depends on Question 1.

6. **Scoped Neon connection string** — once this ADR is approved, I'll
   need a connection string for a role (e.g. `shell_app`, name open to
   change) granted `SELECT` only on `platform.person` and each
   business's staff table (`vls.staff_user`, `collision.staff_user`,
   and `elektrica.staff_user` once it exists) — nothing on any
   case/customer/job/financial table. Not requesting this yet, per
   hermes's note not to request broader access than needed before
   there's a plan to build against.

   UPDATE 2026-09-05: RESOLVED — `shell_app` role + grants
   (`migrations/001_shell_app_role.sql`) plus a `platform.person` RLS
   policy applied and verified live by hermes on staging and
   production (denied read on `vls.case` confirmed, not just
   assumed). Actual `SHELL_DB_URL` connection string received and
   wired into `api/.env` (gitignored); full login+entitlement flow
   re-verified end-to-end against live staging data. Side finding
   from that verification: `vls.staff_user.person_id` is NULL for
   all 5 production staff rows — no `platform.person` row exists for
   VLS staff today, only for clients. Jed decided (2026-09-05,
   relayed by hermes) that staff provisioning should also create a
   `platform.person` row, matching client/customer/renter
   provisioning — that work belongs to the domain bots, not the
   shell. Confirmed directly that the shell's entitlement lookup is
   unaffected either way since it's keyed on `google_email`, never
   `person_id` — `person_id` stays `null` in the shell's
   session/JWT until the domain bots' work lands, and no shell code
   change is needed when it does.

## Non-goals (explicit, per SOUL.md scope)

- Not building any dashboard's actual domain content.
- Not building marketing, financials, or brain-console.
- Not reading or needing access to any case/customer/job/financial
  content — only role/entitlement metadata.
- Not deploying or exposing anything externally without explicit
  approval.
