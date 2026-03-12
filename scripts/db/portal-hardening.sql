\set ON_ERROR_STOP on

SELECT set_config('portal.external_role', :'external_role', false);

DO $do$
DECLARE
  external_role text := current_setting('portal.external_role');
  schema_record record;
  relation_record record;
  type_record record;
  routine_record record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = external_role) THEN
    RAISE EXCEPTION 'Role "%" does not exist', external_role;
  END IF;

  IF (SELECT rolsuper FROM pg_roles WHERE rolname = external_role) THEN
    RAISE EXCEPTION 'Role "%" is SUPERUSER. Run ALTER ROLE % NOSUPERUSER as cluster admin first.', external_role, external_role;
  END IF;

  FOR schema_record IN
    SELECT m.schema_name, m.owner_role
    FROM (
      VALUES
        ('auth', 'portal_auth'),
        ('auth_dev', 'portal_auth'),
        ('atlas', 'portal_atlas'),
        ('dev_atlas', 'portal_atlas'),
        ('xplan', 'portal_xplan'),
        ('xplan_dev', 'portal_xplan'),
        ('dev_xplan', 'portal_xplan'),
        ('kairos', 'portal_xplan'),
        ('chronos', 'portal_xplan'),
        ('plutus', 'portal_plutus'),
        ('plutus_dev', 'portal_plutus'),
        ('dev_talos_us', 'portal_talos'),
        ('dev_talos_uk', 'portal_talos'),
        ('main_talos_us', 'portal_talos'),
        ('main_talos_uk', 'portal_talos'),
        ('dev_hermes', 'portal_talos'),
        ('main_hermes', 'portal_talos'),
        ('dev_argus', 'portal_talos'),
        ('argus_dev', 'portal_talos'),
        ('main_argus', 'portal_talos')
    ) AS m(schema_name, owner_role)
    JOIN pg_namespace n ON n.nspname = m.schema_name
  LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = schema_record.owner_role) THEN
      RAISE EXCEPTION 'Role "%" does not exist', schema_record.owner_role;
    END IF;

    IF (SELECT pg_get_userbyid(nspowner) FROM pg_namespace WHERE nspname = schema_record.schema_name) <> schema_record.owner_role THEN
      EXECUTE format('ALTER SCHEMA %I OWNER TO %I', schema_record.schema_name, schema_record.owner_role);
    END IF;

    FOR relation_record IN
      SELECT c.relname AS object_name, c.relkind
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = schema_record.schema_name
        AND c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
        AND pg_get_userbyid(c.relowner) <> schema_record.owner_role
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
        schema_record.schema_name,
        relation_record.object_name,
        schema_record.owner_role
      );
    END LOOP;

    FOR type_record IN
      SELECT t.typname AS object_name
      FROM pg_type t
      JOIN pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = schema_record.schema_name
        AND t.typtype IN ('e', 'd', 'c')
        AND left(t.typname, 1) <> '_'
        AND pg_get_userbyid(t.typowner) <> schema_record.owner_role
    LOOP
      EXECUTE format('ALTER TYPE %I.%I OWNER TO %I', schema_record.schema_name, type_record.object_name, schema_record.owner_role);
    END LOOP;

    FOR routine_record IN
      SELECT p.proname AS object_name, oidvectortypes(p.proargtypes) AS arg_types
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = schema_record.schema_name
        AND pg_get_userbyid(p.proowner) <> schema_record.owner_role
    LOOP
      EXECUTE format(
        'ALTER ROUTINE %I.%I(%s) OWNER TO %I',
        schema_record.schema_name,
        routine_record.object_name,
        routine_record.arg_types,
        schema_record.owner_role
      );
    END LOOP;

    -- FK checks can execute under the owning role; keep owner access explicit.
    EXECUTE format('GRANT USAGE ON SCHEMA %I TO %I', schema_record.schema_name, schema_record.owner_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO %I', schema_record.schema_name, schema_record.owner_role);
    EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I TO %I', schema_record.schema_name, schema_record.owner_role);
    EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO %I', schema_record.schema_name, schema_record.owner_role);
    EXECUTE format('REVOKE CREATE ON SCHEMA %I FROM %I', schema_record.schema_name, external_role);
  END LOOP;

  EXECUTE format('REVOKE CREATE ON DATABASE %I FROM %I', current_database(), external_role);
  EXECUTE format('REVOKE CREATE ON SCHEMA public FROM %I', external_role);
  REVOKE CREATE ON SCHEMA public FROM PUBLIC;

  IF has_database_privilege(external_role, current_database(), 'CREATE') THEN
    RAISE EXCEPTION 'Role "%" still has CREATE on database "%". Remove inherited grants and rerun hardening.', external_role, current_database();
  END IF;

  IF has_schema_privilege(external_role, 'public', 'CREATE') THEN
    RAISE EXCEPTION 'Role "%" still has CREATE on schema "public". Remove inherited grants and rerun hardening.', external_role;
  END IF;

  FOR schema_record IN
    SELECT m.schema_name
    FROM (
      VALUES
        ('auth'),
        ('auth_dev'),
        ('atlas'),
        ('dev_atlas'),
        ('xplan'),
        ('xplan_dev'),
        ('dev_xplan'),
        ('kairos'),
        ('chronos'),
        ('plutus'),
        ('plutus_dev'),
        ('dev_talos_us'),
        ('dev_talos_uk'),
        ('main_talos_us'),
        ('main_talos_uk'),
        ('dev_hermes'),
        ('main_hermes'),
        ('dev_argus'),
        ('argus_dev'),
        ('main_argus')
    ) AS m(schema_name)
    JOIN pg_namespace n ON n.nspname = m.schema_name
  LOOP
    IF has_schema_privilege(external_role, schema_record.schema_name, 'CREATE') THEN
      RAISE EXCEPTION 'Role "%" still has CREATE on schema "%". Remove inherited grants and rerun hardening.', external_role, schema_record.schema_name;
    END IF;
  END LOOP;
END
$do$;

\echo Portal schema hardening completed.
