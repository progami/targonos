\set ON_ERROR_STOP on

WITH schema_map AS (
  SELECT *
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
  ) AS t(schema_name, owner_role)
),
active_map AS (
  SELECT m.schema_name, m.owner_role
  FROM schema_map m
  JOIN pg_namespace n ON n.nspname = m.schema_name
),
objects AS (
  SELECT n.nspname AS schema_name, 'table' AS object_kind, c.relname AS object_name, pg_get_userbyid(c.relowner) AS owner_name
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  JOIN active_map m ON m.schema_name = n.nspname
  WHERE c.relkind IN ('r', 'p', 'v', 'm', 'S', 'f')
  UNION ALL
  SELECT n.nspname AS schema_name, 'type' AS object_kind, t.typname AS object_name, pg_get_userbyid(t.typowner) AS owner_name
  FROM pg_type t
  JOIN pg_namespace n ON n.oid = t.typnamespace
  JOIN active_map m ON m.schema_name = n.nspname
  WHERE t.typtype IN ('e', 'c', 'd')
    AND left(t.typname, 1) <> '_'
  UNION ALL
  SELECT n.nspname AS schema_name, 'routine' AS object_kind, p.proname || '(' || oidvectortypes(p.proargtypes) || ')' AS object_name, pg_get_userbyid(p.proowner) AS owner_name
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN active_map m ON m.schema_name = n.nspname
)
SELECT o.schema_name || '.' || o.object_name || ' (' || o.object_kind || ') owner=' || o.owner_name || ' expected=' || m.owner_role AS ownership_mismatch
FROM objects o
JOIN active_map m ON m.schema_name = o.schema_name
WHERE o.owner_name <> m.owner_role
ORDER BY o.schema_name, o.object_kind, o.object_name;
