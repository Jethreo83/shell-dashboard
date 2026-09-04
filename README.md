# Shell Dashboard

The thin login + role-gated launcher that hosts the VLS, Elektrica, and
Complete Collision dashboards under one entry point, per Jed's
parallel-build instruction (2026-09-03), step 2.

Owned by Jed. Built by the `shell-dashboard` Hermes profile, integrated
by `hermes` (Jocasta).

## Scope

- One login. One launcher screen showing only the dashboards a logged-in
  user is entitled to. Role-gating is the security boundary — a door
  does not appear unless the user's role allows it.
- Does NOT contain any dashboard's actual domain content — those live in
  their own repos (`vls-dashboard`, `elektrica-dashboard`,
  `complete-collision-dashboard`).
- Financials, marketing, and brain-console dashboards are explicitly
  phase-two HOLD and are not built here or anywhere yet.

## Related repos

- https://github.com/Jethreo83/vls-dashboard
- https://github.com/Jethreo83/elektrica-dashboard
- https://github.com/Jethreo83/complete-collision-dashboard

All share one Neon Postgres project. See
[SHARED_CONVENTIONS.md](https://github.com/Jethreo83/vls-dashboard/blob/main/docs/SHARED_CONVENTIONS.md)
in vls-dashboard for the conventions every project (including this one)
builds against.

## Status

Just started — see `docs/BUILD_LOG.md` for progress.
