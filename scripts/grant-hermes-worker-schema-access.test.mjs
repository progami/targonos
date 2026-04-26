import test from 'node:test'
import assert from 'node:assert/strict'

import {
  parsePgBouncerDatabases,
  resolveWorkerDatabase,
} from './grant-hermes-worker-schema-access.mjs'

const pgbouncerConfig = `
[databases]
portal_db_hermes = host=127.0.0.1 port=5432 dbname=portal_db_dev pool_size=10 connect_query='SET search_path=dev_hermes'
`

test('parsePgBouncerDatabases reads dbname and search_path from aliases', () => {
  const databases = parsePgBouncerDatabases(pgbouncerConfig)

  assert.deepEqual(databases.get('portal_db_hermes'), {
    dbname: 'portal_db_dev',
    searchPath: 'dev_hermes',
  })
})

test('resolveWorkerDatabase derives backend DB and schema for PgBouncer Hermes worker', () => {
  const result = resolveWorkerDatabase({
    databaseUrl: 'postgresql://portal_dev_external@localhost:6432/portal_db_hermes?pgbouncer=true',
    schemaFromEnv: 'dev_hermes',
    pgbouncerConfigText: pgbouncerConfig,
  })

  assert.deepEqual(result, {
    databaseName: 'portal_db_dev',
    schemaName: 'dev_hermes',
    workerRole: 'portal_dev_external',
  })
})

test('resolveWorkerDatabase rejects unsafe identifiers', () => {
  assert.throws(
    () => resolveWorkerDatabase({
      databaseUrl: 'postgresql://portal_dev_external@localhost:5432/portal_db',
      schemaFromEnv: 'dev_hermes;drop',
      pgbouncerConfigText: pgbouncerConfig,
    }),
    /schema name is not a safe SQL identifier/,
  )
})
