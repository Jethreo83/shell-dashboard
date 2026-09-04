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
