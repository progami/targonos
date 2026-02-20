\set ON_ERROR_STOP on

WITH schemas AS (
  SELECT unnest(ARRAY['dev_talos_us', 'dev_talos_uk', 'main_talos_us', 'main_talos_uk']) AS schema_name
),
objects AS (
  SELECT n.nspname AS schema_name, 'type' AS object_kind, t.typname AS object_name, pg_get_userbyid(t.typowner) AS owner_name
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN schemas s ON s.schema_name = n.nspname
  WHERE t.typtype IN ('e', 'c', 'd')
    AND left(t.typname, 1) <> '_'
  UNION ALL
  SELECT n.nspname AS schema_name, 'table' AS object_kind, c.relname AS object_name, pg_get_userbyid(c.relowner) AS owner_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN schemas s ON s.schema_name = n.nspname
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT n.nspname AS schema_name, 'routine' AS object_kind, p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS object_name, pg_get_userbyid(p.proowner) AS owner_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN schemas s ON s.schema_name = n.nspname
)
SELECT schema_name || '.' || object_name || ' (' || object_kind || ') owner=' || owner_name AS ownership_mismatch
FROM objects
WHERE owner_name <> :'expected_owner'
ORDER BY schema_name, object_kind, object_name;
