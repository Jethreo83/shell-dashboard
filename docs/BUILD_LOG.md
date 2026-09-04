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

