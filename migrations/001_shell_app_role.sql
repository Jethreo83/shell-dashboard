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

CREATE ROLE shell_app LOGIN PASSWORD :'shell_app_password';

GRANT USAGE ON SCHEMA platform TO shell_app;
GRANT SELECT (id, email_normalized, first_name, last_name) ON platform.person TO shell_app;

GRANT USAGE ON SCHEMA vls TO shell_app;
GRANT SELECT (id, person_id, google_email, role, active) ON vls.staff_user TO shell_app;

GRANT USAGE ON SCHEMA collision TO shell_app;
GRANT SELECT (id, person_id, google_email, role, active) ON collision.staff_user TO shell_app;

GRANT USAGE ON SCHEMA elektrica TO shell_app;
GRANT SELECT (id, person_id, google_email, role, active) ON elektrica.staff_user TO shell_app;

-- Explicitly NOT granted (documented for clarity, these are no-ops since
-- shell_app has no ambient privilege, but stating the boundary plainly):
-- vls.case, vls.client, vls.case_event, vls.case_cost, vls.case_financial
-- collision.job, collision.customer, collision.estimate, collision.content_item
-- elektrica.renter, elektrica.vehicle, elektrica.rental, elektrica.rental_event
-- platform.document*, platform.communication, platform.outbound_log
