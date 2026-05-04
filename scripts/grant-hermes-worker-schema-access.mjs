import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const DEFAULT_PROCESS_NAME = 'dev-hermes-orders-sync'
const DEFAULT_PGBOUNCER_CONFIG = '/opt/homebrew/etc/pgbouncer.ini'

export function assertIdentifier(value, label) {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(value)) {
    throw new Error(`${label} is not a safe SQL identifier: ${value}`)
  }
}

export function parsePgBouncerDatabases(configText) {
  const databases = new Map()
  let section = ''
  for (const rawLine of configText.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith(';')) {
      continue
    }

    const sectionMatch = line.match(/^\[([^\]]+)\]$/)
    if (sectionMatch) {
      section = sectionMatch[1]
      continue
    }

    if (section !== 'databases') {
      continue
    }

    const equalsIndex = line.indexOf('=')
    if (equalsIndex === -1) {
      continue
    }

    const alias = line.slice(0, equalsIndex).trim()
    const rhs = line.slice(equalsIndex + 1).trim()
    const dbMatch = rhs.match(/\bdbname=([^\s]+)/)
    const searchPathMatch = rhs.match(/search_path=([A-Za-z_][A-Za-z0-9_]*)/)
    databases.set(alias, {
      dbname: dbMatch?.[1],
      searchPath: searchPathMatch?.[1],
    })
  }

  return databases
}

export function resolveWorkerDatabase({ databaseUrl, schemaFromEnv, pgbouncerConfigText }) {
  const parsedUrl = new URL(databaseUrl)
  const workerRole = decodeURIComponent(parsedUrl.username)
  const urlDatabaseName = decodeURIComponent(parsedUrl.pathname.replace(/^\//, ''))
  const urlSchema = parsedUrl.searchParams.get('schema')

  if (workerRole === '') {
    throw new Error('DATABASE_URL is missing a username')
  }

  if (urlDatabaseName === '') {
    throw new Error('DATABASE_URL is missing a database name')
  }

  let databaseName = urlDatabaseName
  let schemaName = schemaFromEnv
  if (parsedUrl.port === '6432') {
    const databases = parsePgBouncerDatabases(pgbouncerConfigText)
    const mapping = databases.get(urlDatabaseName)
    if (mapping === undefined) {
      throw new Error(`PgBouncer database alias not found: ${urlDatabaseName}`)
    }

    if (typeof mapping.dbname !== 'string' || mapping.dbname === '') {
      throw new Error(`PgBouncer database alias is missing dbname: ${urlDatabaseName}`)
    }

    databaseName = mapping.dbname
    if (schemaName === '') {
      schemaName = mapping.searchPath ?? ''
    }
  }

  if (schemaName === '') {
    schemaName = urlSchema ?? ''
  }

  if (schemaName === '') {
    throw new Error('Could not derive Hermes schema from HERMES_DB_SCHEMA, DATABASE_URL, or PgBouncer connect_query')
  }

  assertIdentifier(workerRole, 'worker role')
  assertIdentifier(databaseName, 'database name')
  assertIdentifier(schemaName, 'schema name')

  return {
    databaseName,
    schemaName,
    workerRole,
  }
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    input: options.input,
    maxBuffer: 10 * 1024 * 1024,
  })

  if (result.status !== 0) {
    throw new Error(`${command} ${args.join(' ')} failed: ${result.stderr}${result.stdout}`)
  }

  return result.stdout
}

function loadPm2Process(processName) {
  const pm2Json = run('pm2', ['jlist'])
  const processes = JSON.parse(pm2Json)
  const process = processes.find((entry) => entry.name === processName)
  if (process === undefined) {
    throw new Error(`${processName} not found in pm2 jlist`)
  }

  return process
}

function grantSql() {
  return `
\\set ON_ERROR_STOP on

SELECT set_config('targonos.worker_role', :'worker_role', false);
SELECT set_config('targonos.schema_name', :'schema_name', false);

DO $do$
DECLARE
  worker_role text := current_setting('targonos.worker_role');
  schema_name text := current_setting('targonos.schema_name');
  owner_role text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = worker_role) THEN
    RAISE EXCEPTION 'Worker role "%" does not exist', worker_role;
  END IF;

  SELECT n.nspowner::regrole::text
    INTO owner_role
    FROM pg_namespace n
   WHERE n.nspname = schema_name;

  IF owner_role IS NULL THEN
    RAISE EXCEPTION 'Schema "%" does not exist', schema_name;
  END IF;

  IF owner_role <> worker_role THEN
    EXECUTE format('GRANT %I TO %I', owner_role, worker_role);
  END IF;

  EXECUTE format('GRANT USAGE, CREATE ON SCHEMA %I TO %I', schema_name, worker_role);
  EXECUTE format('GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA %I TO %I', schema_name, worker_role);
  EXECUTE format('GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA %I TO %I', schema_name, worker_role);
  EXECUTE format('GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA %I TO %I', schema_name, worker_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT ALL PRIVILEGES ON TABLES TO %I', owner_role, schema_name, worker_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT ALL PRIVILEGES ON SEQUENCES TO %I', owner_role, schema_name, worker_role);
  EXECUTE format('ALTER DEFAULT PRIVILEGES FOR ROLE %I IN SCHEMA %I GRANT EXECUTE ON FUNCTIONS TO %I', owner_role, schema_name, worker_role);
END
$do$;
`
}

function parseArgs(argv) {
  let processName = DEFAULT_PROCESS_NAME
  let pgbouncerConfig = DEFAULT_PGBOUNCER_CONFIG
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--process') {
      const value = argv[index + 1]
      if (value === undefined) {
        throw new Error('--process requires a value')
      }
      processName = value
      index += 1
      continue
    }

    if (arg === '--pgbouncer-config') {
      const value = argv[index + 1]
      if (value === undefined) {
        throw new Error('--pgbouncer-config requires a value')
      }
      pgbouncerConfig = value
      index += 1
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { processName, pgbouncerConfig }
}

function main() {
  const { processName, pgbouncerConfig } = parseArgs(process.argv.slice(2))
  const pm2Process = loadPm2Process(processName)
  const databaseUrl = pm2Process.pm2_env?.DATABASE_URL
  if (typeof databaseUrl !== 'string' || databaseUrl.trim() === '') {
    throw new Error(`${processName} DATABASE_URL is missing`)
  }

  const schemaFromEnvValue = pm2Process.pm2_env?.HERMES_DB_SCHEMA
  const schemaFromEnv = typeof schemaFromEnvValue === 'string' ? schemaFromEnvValue.trim() : ''
  const pgbouncerConfigText = readFileSync(pgbouncerConfig, 'utf8')
  const resolved = resolveWorkerDatabase({
    databaseUrl,
    schemaFromEnv,
    pgbouncerConfigText,
  })

  run('psql', [
    '-d',
    resolved.databaseName,
    '-v',
    `worker_role=${resolved.workerRole}`,
    '-v',
    `schema_name=${resolved.schemaName}`,
    '-f',
    '-',
  ], { input: grantSql() })

  console.log(`Granted ${resolved.workerRole} Hermes worker access on ${resolved.databaseName}.${resolved.schemaName}`)
}

const modulePath = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  main()
}
