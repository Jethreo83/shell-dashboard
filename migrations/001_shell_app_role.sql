-- 001_shell_app_role.sql
-- Creates the shell_app database role with the minimal grant it needs:
-- read-only entitlement lookup against platform.person + each business's
-- own staff_user table. No access to any case/customer/job/financial
-- content whatsoever - the shell only needs to know WHO has access to
-- WHICH dashboard, never the content of that dashboard.
--
-- Per shell-dashboard's ADR-001, decision area 2: "no grant on vls.case,
-- vls.client, collision.job, collision.customer, elektrica.rental, or
-- any case/customer/financial content whatsoever."
--
-- elektrica.staff_user does not exist on production yet (still
-- staging-only, placeholder role enum pending Jed's answer) - the
-- elektrica grants are split into their own conditional block below so
-- this migration applies cleanly on both environments regardless of
-- which one has that table yet.

CREATE ROLE shell_app LOGIN PASSWORD :'shell_app_password';

GRANT USAGE ON SCHEMA platform TO shell_app;
GRANT SELECT (id, email_normalized, first_name, last_name) ON platform.person TO shell_app;

GRANT USAGE ON SCHEMA vls TO shell_app;
GRANT SELECT (id, person_id, google_email, role, active) ON vls.staff_user TO shell_app;

GRANT USAGE ON SCHEMA collision TO shell_app;
GRANT SELECT (id, person_id, google_email, role, active) ON collision.staff_user TO shell_app;

GRANT USAGE ON SCHEMA elektrica TO shell_app;

-- 2026-09-05 update (hermes): elektrica.staff_user now exists on both
-- staging and production (migration 011 promoted same day). The
-- conditional guard below is KEPT (not dropped) so this migration still
-- applies cleanly on a fresh/rebuilt environment where elektrica hasn't
-- run yet - but it silently no-ops if the table already existed at the
-- time THIS migration first ran and was never re-applied after. That
-- exact gap caused a real bug: shell_app had no grant on
-- elektrica.staff_user in either environment, surfacing as "permission
-- denied for table staff_user" on every login (any business), because
-- entitlements.ts queries all three staff tables unconditionally and an
-- uncaught permission error there fails the whole login, not just
-- Elektrica's door. Fixed directly via GRANT on both environments
-- 2026-09-05; this file's guard updated so it is now idempotent/safe to
-- re-run even after the table exists (GRANT is itself idempotent).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'elektrica' AND table_name = 'staff_user'
  ) THEN
    EXECUTE 'GRANT SELECT (id, person_id, google_email, role, active) ON elektrica.staff_user TO shell_app';
  END IF;
END $$;

-- Explicitly NOT granted (documented for clarity, these are no-ops since
-- shell_app has no ambient privilege, but stating the boundary plainly):
-- vls.case, vls.client, vls.case_event, vls.case_cost, vls.case_financial
-- collision.job, collision.customer, collision.estimate, collision.content_item
-- elektrica.renter, elektrica.vehicle, elektrica.rental, elektrica.rental_event
-- platform.document*, platform.communication, platform.outbound_log
