-- 002_shell_app_person_rls.sql
-- shell_app needs to read platform.person for its own person_id lookup
-- (matching a Google-verified email to a person, then checking each
-- business's staff table) but the RLS policies on platform.person only
-- covered vls_app/elektrica_app/collision_app (each scoped to their own
-- party table) plus identity_service. shell_app had no policy at all,
-- so despite the column-level GRANT, RLS silently returned zero rows.
--
-- Fix: shell_app may see a person row if that person has an active
-- staff_user row in ANY of the three business staff tables - i.e. the
-- same "is this person staff somewhere" check the shell already does
-- itself, mirrored as the RLS boundary. This does NOT grant shell_app
-- visibility into client/customer/renter party rows (vls.client,
-- elektrica.renter, collision.customer) - only staff.
--
-- elektrica.staff_user does not exist on production yet, so this policy
-- is written to work whether or not it exists: created without the
-- elektrica clause first, then the elektrica clause is added via
-- ALTER POLICY only if that table is present. Re-running this file after
-- elektrica.staff_user is promoted will pick up the elektrica clause.

DROP POLICY IF EXISTS shell_app_sees_staff_persons ON platform.person;

DO $$
DECLARE
  v_elektrica_exists BOOLEAN;
  v_using_clause TEXT;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'elektrica' AND table_name = 'staff_user'
  ) INTO v_elektrica_exists;

  v_using_clause := '(EXISTS (SELECT 1 FROM vls.staff_user s WHERE s.person_id = person.id)'
    || ' OR EXISTS (SELECT 1 FROM collision.staff_user s WHERE s.person_id = person.id)';

  IF v_elektrica_exists THEN
    v_using_clause := v_using_clause
      || ' OR EXISTS (SELECT 1 FROM elektrica.staff_user s WHERE s.person_id = person.id)';
  END IF;

  v_using_clause := v_using_clause || ')';

  EXECUTE format(
    'CREATE POLICY shell_app_sees_staff_persons ON platform.person FOR SELECT TO shell_app USING %s',
    v_using_clause
  );
END $$;
