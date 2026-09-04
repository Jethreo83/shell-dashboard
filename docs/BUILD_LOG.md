# Build Log — shell-dashboard

## 2026-09-04 (session 1)

- Read, in full: `INSTRUCTION_Jocasta_parallel_build_2026-09-03.md`,
  `SHARED_CONVENTIONS.md`, VLS's `web/src/auth.tsx` +
  `api/src/auth.ts` (the pattern to generalize), VLS's README, and the
  current repo trees + relevant migrations for all three domain repos
  (`vls-dashboard`, `elektrica-dashboard`, `complete-collision-dashboard`).
- Findings that shaped the plan:
  - VLS and Collision each already have their own `staff_user` table
    with a role enum, keyed by Google email, admin-provisioned,
    `active` flag. Elektrica does **not** have one yet — `elektrica.renter`
    is the customer/party table, not staff. This is a real gap, not
    something I'm inventing on Elektrica's behalf.
  - Collision's role→capability model currently resolves all three
    roles (owner/manager/receptionist) to the same `'full'` capability
    per Jed's 2026-09-04 decision — so today the only real gate for
    Collision is "active staff member at all," same shape the shell
    needs.
  - None of the three dashboards has a live backend/frontend yet — the
    shell is being planned ahead of anything it will launch into. Per
    `SHARED_CONVENTIONS.md` this is explicitly "phase-two-early" but
    hermes asked for the plan now regardless; not treating that as
    license to start building app code.
- Wrote `docs/ADR-001-shell-architecture.md` — architecture, the
  read-only role-gating mechanism against the three schemas, a
  concrete definition of "entitled to a dashboard," and six open
  questions (JWT/session trust model across the four services is the
  big one — it forks nearly everything else).
- Not built: no code, no migration, no scoped DB connection requested
  yet. Holding for hermes/Jed review per SOUL.md instructions.
- Reported to hermes via message_agent (not directly to Jed, per
  SOUL.md).

## Next steps (pending review)

- Get answers to the 6 open questions in the ADR (JWT/session trust
  model is the blocking one).
- Once answered: request a scoped Neon connection string
  (`SELECT`-only on `platform.person` + each business's staff table)
  and start building the login + launcher against a live DB, verified
  by direct query per the same standard every other bot here holds to.

## 2026-09-04 (session 2) — cleared to build, first working skeleton

hermes answered all 6 open questions (2026-09-04):
1. One JWT, true SSO — all dashboard APIs verify it directly via a
   shared secret/issuer convention. Not a redirect/exchange-token
   handoff.
2. Omit Elektrica's door until it has its own staff_user table. My
   proposal confirmed correct — not building it on their behalf, not
   flagging as urgent; hermes will note it to elektrica-dashboard
   separately.
3. Collision's/Elektrica's actual Google Workspace domains: still not
   confirmed by anyone. hermes will get them from Jed and relay
   before Decision 4 needs to be real. Left as `null` in
   `api/src/businesses.ts` on purpose — not guessed at.
4. Real routing-level enforcement, not UI-only.
5. No blocklist/revocation for now — 8h TTL, same tradeoff VLS already
   lives with. Logout = client discards token; a copied token stays
   valid until expiry. Revisit only if/when financials needs harder
   guarantees.
6. Scoped Neon connection string: hold off requesting until actually
   ready to build against live data — asked for it in this session's
   report below.

Cleared to move from ADR to actual build on this basis.

Built and verified (all claims below backed by real command output,
not just "the code looks right"):

- `docs/JWT_CONTRACT.md` — the shared secret/issuer SSO contract other
  dashboard bots' backends need to implement equivalently (mirrors
  VLS's own `requireAuth` shape). Flags one open item for hermes: does
  VLS's existing standalone `/auth/google` + own JWT get retired once
  the shell exists, or run in parallel for a transition period — not
  my call to make alone.
- `api/` — Express + TypeScript skeleton:
  - `businesses.ts` — static domain→business→staffTable config.
    Collision's and Elektrica's domains are `null` on purpose (Open
    Question 3, unresolved) — code comment states explicitly not to
    guess them.
  - `entitlements.ts` — read-only grant lookup against each
    business's own `staff_user` table. Handles Elektrica's table not
    existing yet (`undefined_table`, Postgres code 42P01) as "no
    grant," not a hard failure, so the launcher still works for
    VLS/Collision while Elektrica's table is pending.
  - `auth.ts` — Google ID token verification, multi-business grant
    lookup, SSO JWT issuance (`iss: "shell-dashboard"`, `grants[]`,
    8h TTL), and `requireShellAuth` verification middleware.
  - `server.ts` — `/health`, `POST /auth/google`, `GET /me` (re-reads
    grants fresh from the DB every call — fail-closed re-check, not
    trust-the-JWT, matching VLS's own `requireAuth` pattern).
  - `npx tsc -p . --noEmit` → clean, no errors.
  - Ran the built server locally against fake env vars (no real DB
    yet) and exercised it with curl:
    - `GET /health` → 200 `{"ok":true,...}`.
    - `POST /auth/google` with no body → 400 `missing_id_token`.
    - `GET /me` with no auth header → 401 `missing_token`.
    - `GET /me` with a malformed token → 401 `invalid_or_expired_token`.
    - `GET /me` with a validly-signed token whose `iss` is NOT
      `shell-dashboard` → 401 `invalid_issuer` (confirms the
      issuer check works, not just signature verification).
    - `GET /me` with a valid, correctly-issued token against an
      **unreachable DB** (`ECONNREFUSED`) → **found a real bug**: the
      first version crashed the whole Node process instead of failing
      closed. Fixed by wrapping the DB-touching paths in `/me` and
      `POST /auth/google` in try/catch → 503
      `entitlement_check_failed`, confirmed by curl the server now
      returns the 503 and stays alive (`/health` still responds
      afterward). This is exactly the "verify against a live
      failure mode, not just that the code ran" standard — caught a
      genuine crash bug before it could reach production.
- `web/` — Vite + React + TypeScript skeleton:
  - `auth.tsx` — generalized from VLS's own `web/src/auth.tsx`:
    same Google Identity Services + localStorage-JWT pattern, single
    `role` replaced with a `grants[]` array.
  - `Launcher.tsx` — renders one door per entry in `/me`'s `doors`
    array only; deploy URLs per dashboard left unset on purpose
    (none of the three dashboards has a live URL yet).
  - `npx tsc -b --noEmit` → clean (had to add `vite-env.d.ts` for
    `import.meta.env` typing — caught by the first typecheck run,
    fixed, re-verified clean).
  - `npx vite build` → succeeded, produced `dist/index.html` +
    bundled JS (145 KB, 47 KB gzipped).
- Confirmed no secrets committed: `.env` files are gitignored,
  `.env.example` templates committed instead; build artifacts
  (`dist/`, `node_modules/`, `*.tsbuildinfo`) excluded via
  `.gitignore`. Checked `git status`/`git check-ignore` directly
  before committing, not assumed.

Not done yet / explicitly still open:
- No real DB connection — still waiting on hermes for the scoped
  `shell_app` connection string (SELECT-only on `platform.person` +
  each business's `staff_user`). Requested in this session's report.
- `platform.person`-based `person_id` resolution in `auth.ts` is a
  stubbed `null` (`TODO` comment in code) — needs that connection
  string to wire for real, not guessed at.
- No deploy anywhere, nothing exposed externally. Committing/pushing
  source to the already-public repo (below) is not the same as
  deploying a running service — that still has not happened, and
  won't without explicit approval per SOUL.md.
- Dashboard deploy URLs in `Launcher.tsx`'s `DASHBOARD_URLS` map are
  all `undefined` — correct today since none of VLS/Elektrica/Collision
  has a live frontend yet either.

## 2026-09-05 — Elektrica's staff_user table landed

hermes reported `elektrica.staff_user` now exists (built and verified
live by the elektrica-dashboard bot): `person_id` FK, role enum
(`owner`/`staff`, explicitly placeholder — not yet Jed-confirmed),
`google_email`, `active` flag, `provisioned_by_staff_user_id`. Same
shape as `vls.staff_user`/`collision.staff_user`, so the existing
role-gating mechanism generalizes without code changes — confirmed
this directly: `entitlements.ts` never branches on a specific role
string, only checks whether an active row exists at all, and
`Launcher.tsx` renders `role` as opaque display text
(`Role: {d.role}`), never switches on its value. Both already satisfy
hermes's instruction not to build anything that treats "owner" vs
"staff" as meaningfully different yet.

Changes made:
- `api/src/businesses.ts`: updated comments to reflect the table now
  existing; `staffTable: 'elektrica.staff_user'` entry unchanged
  (it was already correct, just commented as not-yet-existing
  before). Domain is still `null` — table existing and domain being
  confirmed are two separate gates (Open Question 3 is still open;
  Elektrica's door still won't render in the launcher until hermes
  relays a real domain, correctly).
- `api/src/entitlements.ts`: re-labeled the `undefined_table`
  fallback as defense-in-depth rather than the expected path, since
  as of today all three staff_user tables exist.
- `npx tsc -p . --noEmit` → clean after the edit.

No logic changes were needed — this generalized for free, which is
the whole point of building the mechanism against "does an active row
exist in this business's own staff table" rather than anything
business-specific. Still blocked on the same two things as before:
the scoped Neon connection string (requested, not yet received) and
Collision's/Elektrica's confirmed Google Workspace domains.

## 2026-09-05 — shell_app role + platform.person RLS applied and verified live

hermes applied `migrations/001_shell_app_role.sql` (the shell_app
role + grants I'd committed as source but not applied myself) plus a
`platform.person` RLS policy, on both staging and production. Verified
directly by hermes, not just "the migration ran": staging shows 2
person rows visible correctly and a denied read on `vls.case`
(confirms the no-case-access boundary holds for real, not just in
comments); production shows the same pattern.

Real gap surfaced during that verification: `vls.staff_user.person_id`
is NULL for all 5 production staff rows — no `platform.person` row
was ever created for VLS staff (only for clients). This means the
`person_id: null` TODO already sitting in `api/src/auth.ts`'s
`ShellSession` construction was the right call, not a shortcut to
revisit — resolving `person_id` from the DB right now would find
nothing to resolve to for any real staff member anyway. hermes is
treating "should staff provisioning also create a `platform.person`
row per convention #1" as a separate open question for the domain
bots to answer, not something for shell to fix. No code change needed
here; the TODO stays exactly as-is pending that decision elsewhere.

Actual `SHELL_DB_URL` connection string coming in a follow-up message
(kept out of the same message as the "applied and verified" report,
correctly, so a secret isn't sitting in plain chat text next to
unrelated content). Once received: drop into `api/.env` (gitignored,
never commit), point `DATABASE_URL` at it, and re-run the same curl
exercise from the 2026-09-04 session — `/health`, `/auth/google`,
`/me` — against the real staging DB this time, not fake env vars,
before calling entitlement lookup verified end-to-end.

Also found `migrations/001_shell_app_role.sql` updated (elektrica
grant now conditional on the table existing, since it's still
staging-only on production) and a new
`migrations/002_shell_app_person_rls.sql` in the working tree —
the actual RLS policy referenced above: `shell_app` may SELECT a
`platform.person` row only if that person has an active row in ANY
of the three business staff tables, joined on `staff_user.person_id`.
Reviewed both: no secrets embedded, scoped correctly (staff
visibility only — explicitly does not grant visibility into
`vls.client`/`elektrica.renter`/`collision.customer`), and written
defensively for elektrica.staff_user's staging-only status on
production. Committed as source. Worth noting: since this RLS policy
joins on `staff_user.person_id`, and that column is NULL for all 5
production VLS staff rows (see above), the policy currently returns
zero visible `platform.person` rows for VLS staff specifically —
consistent with, not a new instance of, the same gap. No shell-side
action needed; same wait-for-domain-bots-decision applies.

## 2026-09-05 — SHELL_DB_URL received; wired in and verified end-to-end against live staging

hermes sent staging + production `SHELL_DB_URL` connection strings.
Wrote `api/.env` (gitignored — confirmed via `git check-ignore -v`
and `git status --short` before AND after, never staged) pointing
`DATABASE_URL` at **staging**, per hermes's instruction to use
staging for dev/testing.

Before trusting anything, ran a direct DB smoke test — and caught a
methodology bug in my own first attempt: a stale `DATABASE_URL`
(pointing at `neondb_owner`/production, left over from an earlier
`terminal` call in this session) was already exported in the shell
environment, and `dotenv` does not override existing env vars. That
first run appeared to show `SELECT` on `vls.case` succeeding —
which would have been a real security incident if true. Diagnosed it
properly instead of either panicking or dismissing it: checked
`current_user`/`session_user` (came back `neondb_owner`, not
`shell_app` — the tell), ran `has_table_privilege`, and inspected
`information_schema.role_table_grants` directly. Confirmed the cause
was the leftover env var overriding the intended staging/`shell_app`
connection, not a flaw in the migration. `unset DATABASE_URL
DATABASE_URL_UNPOOLED` and re-ran: `current_user` correctly came back
`shell_app`, and `SELECT ... FROM vls.case` correctly failed with
`permission denied for table case` — matching exactly what hermes
reported. Recording this because it's the kind of near-miss worth
being explicit about: the fix was verifying the actual session
identity before either confirming or denying a security claim, not
trusting the first result.

With a clean environment, built (`tsc -p .`) and booted the real API
server (`node dist/server.js`) against live staging, then ran the
full fail-closed exercise hermes asked for — against the real server
and real DB this time, not fake env vars:

- `GET /health` → 200, server up.
- `POST /auth/google` with no body → 400 `missing_id_token`.
- `POST /auth/google` with a garbage (non-JWT) `id_token` → 401
  `invalid_google_token` (Google verification itself rejects it, not
  just a shape check).
- `GET /me` with no auth header → 401 `missing_token`.
- `GET /me` with a malformed token → 401 `invalid_or_expired_token`.
- `GET /me` with a validly-signed token whose `iss` is not
  `shell-dashboard` → 401 `invalid_issuer` (issuer check exercised
  against the live server, not just the earlier fake-env-var test).

Then the test that actually matters most — proving the fail-closed
DB re-check (ADR-001 Decision 1) works against real staff rows, not
just an empty table:
- Looked up (masked, not printed raw) a real **active** VLS staff
  row on staging, signed a JWT for that email with **empty/stale**
  `grants` in the token payload, and hit `/me` — got back
  `grants: [{business: "vls", role: "admin"}]`, `doors` populated.
  Confirms `/me` derives grants fresh from the DB and does NOT trust
  whatever the JWT claims.
- Looked up a real **inactive** (`active = false`) VLS staff row,
  signed a JWT for that email with `grants` **claiming** an active
  `vls` grant, and hit `/me` — got back `grants: []`, `doors: []`.
  This is the property the whole design exists for: a deactivated
  staff member's stale/copied token cannot get a door rendered, even
  if the token itself claims otherwise, because `/me` re-derives from
  `active = true` in the DB every call.
- An email with no staff row anywhere → `grants: []`, `doors: []`,
  no error, as expected.

All of the above ran against staging, with real data (masked in
terminal output, never printed raw), then all scratch test scripts
were deleted (nothing left in the repo). Production connection string
received but intentionally not used for any test — staging only, per
hermes's instruction.

Still outstanding: Collision's/Elektrica's confirmed Google Workspace
domains (Open Question 3), and the platform.person/staff linkage gap
(separate, tracked with the domain bots). Otherwise the shell's
login + entitlement + fail-closed re-check is now verified working
end-to-end against real, live data — not just unit-level or
fake-env-var testing.

