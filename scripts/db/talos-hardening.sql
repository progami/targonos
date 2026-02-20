\set ON_ERROR_STOP on

SELECT set_config('talos.owner_role', :'owner_role', false);
SELECT set_config('talos.external_role', :'external_role', false);

DO $do$
DECLARE
  owner_role text := current_setting('talos.owner_role');
  external_role text := current_setting('talos.external_role');
  schema_name text;
  relation_record record;
  type_record record;
  routine_record record;
  talos_schemas text[] := ARRAY['dev_talos_us', 'dev_talos_uk', 'main_talos_us', 'main_talos_uk'];
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = owner_role) THEN
    RAISE EXCEPTION 'Role "%" does not exist', owner_role;
  END IF;

  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = external_role) THEN
    RAISE EXCEPTION 'Role "%" does not exist', external_role;
  END IF;

  IF (SELECT rolsuper FROM pg_roles WHERE rolname = external_role) THEN
    RAISE EXCEPTION 'Role "%" is SUPERUSER. Run ALTER ROLE % NOSUPERUSER as cluster admin first.', external_role, external_role;
  END IF;

  FOR relation_record IN
    SELECT n.nspname AS schema_name, c.relname AS object_name, c.relkind
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = ANY (talos_schemas)
      AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
      AND pg_get_userbyid(c.relowner) <> owner_role
  LOOP
    EXECUTE format(
      'ALTER %s %I.%I OWNER TO %I',
      CASE relation_record.relkind
        WHEN 'S' THEN 'SEQUENCE'
        WHEN 'v' THEN 'VIEW'
        WHEN 'm' THEN 'MATERIALIZED VIEW'
        WHEN 'f' THEN 'FOREIGN TABLE'
        ELSE 'TABLE'
      END,
      relation_record.schema_name,
      relation_record.object_name,
      owner_role
    );
  END LOOP;

  FOR type_record IN
    SELECT n.nspname AS schema_name, t.typname AS object_name
    FROM pg_type t
    JOIN pg_namespace n ON n.oid = t.typnamespace
    WHERE n.nspname = ANY (talos_schemas)
      AND t.typtype IN ('e', 'd', 'c')
      AND left(t.typname, 1) <> '_'
      AND pg_get_userbyid(t.typowner) <> owner_role
  LOOP
    EXECUTE format('ALTER TYPE %I.%I OWNER TO %I', type_record.schema_name, type_record.object_name, owner_role);
  END LOOP;

  FOR routine_record IN
    SELECT
      n.nspname AS schema_name,
      p.proname AS object_name,
      oidvectortypes(p.proargtypes) AS arg_types
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = ANY (talos_schemas)
      AND pg_get_userbyid(p.proowner) <> owner_role
  LOOP
    EXECUTE format(
      'ALTER ROUTINE %I.%I(%s) OWNER TO %I',
      routine_record.schema_name,
      routine_record.object_name,
      routine_record.arg_types,
      owner_role
    );
  END LOOP;

  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM %I', current_database(), external_role);

  FOREACH schema_name IN ARRAY talos_schemas
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name) THEN
      CONTINUE;
    END IF;

    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I', schema_name, external_role);
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_name, external_role);
    EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA %I TO %I', schema_name, external_role);
    EXECUTE format('GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA %I TO %I', schema_name, external_role);
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT SELECT,INSERT,UPDATE,DELETE ON TABLES TO %I',
      owner_role,
      schema_name,
      external_role
    );
    EXECUTE format(
      'ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT USAGE,SELECT ON SEQUENCES TO %I',
      owner_role,
      schema_name,
      external_role
    );
  END LOOP;

  IF has_database_privilege(external_role, current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Role "%" still has CREATE on database "%". Remove inherited grants and rerun hardening.', external_role, current_database();
  END IF;

  FOREACH schema_name IN ARRAY talos_schemas
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = schema_name) THEN
      CONTINUE;
    END IF;

    IF has_schema_privilege(external_role, schema_name, 'CREATE') THEN
      RAISE EXCEPTION 'Role "%" still has CREATE on schema "%". Remove inherited grants and rerun hardening.', external_role, schema_name;
    END IF;
  END LOOP;
END
$do$;

\echo Talos DB hardening completed.
