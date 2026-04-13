const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')

const rootDir = path.resolve(__dirname, '..')
const deployScript = fs.readFileSync(path.join(rootDir, 'scripts', 'deploy-app.sh'), 'utf8')
const authPackage = JSON.parse(fs.readFileSync(path.join(rootDir, 'packages', 'auth', 'package.json'), 'utf8'))

test('auth package exposes a deploy-safe prisma migrate command', () => {
  assert.equal(
    authPackage.scripts['prisma:migrate:deploy'],
    'prisma migrate deploy --schema prisma/schema.prisma',
  )
})

test('sso deploy runs auth prisma migrations through the auth workspace', () => {
  assert.match(
    deployScript,
    /sso\|targon\|targonos\)[\s\S]*?migrate_cmd="pnpm --filter @targon\/auth prisma:migrate:deploy"/,
  )
})

test('sso deploy uses PORTAL_DB_URL for migration readiness instead of app DATABASE_URL', () => {
  assert.match(
    deployScript,
    /case "\$app_key" in[\s\S]*?sso\|targon\|targonos\)[\s\S]*?ensure_portal_db_url[\s\S]*?migration_env_ready="true"/,
  )
  assert.match(
    deployScript,
    /error "PORTAL_DB_URL is not set and no env file found; cannot apply auth migrations"/,
  )
})

test('shared-db deploys map apps onto deterministic owner roles and local owner URLs', () => {
  assert.match(
    deployScript,
    /migration_owner_role_for_app\(\)[\s\S]*?sso\|targon\|targonos\)[\s\S]*?printf 'portal_auth'/,
  )
  assert.match(
    deployScript,
    /migration_owner_role_for_app\(\)[\s\S]*?atlas\)[\s\S]*?printf 'portal_atlas'/,
  )
  assert.match(
    deployScript,
    /migration_owner_role_for_app\(\)[\s\S]*?xplan\|kairos\)[\s\S]*?printf 'portal_xplan'/,
  )
  assert.match(
    deployScript,
    /migration_owner_role_for_app\(\)[\s\S]*?talos\|argus\)[\s\S]*?printf 'portal_talos'/,
  )
  assert.match(
    deployScript,
    /migration_owner_role_for_app\(\)[\s\S]*?plutus\)[\s\S]*?printf 'portal_plutus'/,
  )
  assert.match(
    deployScript,
    /build_owner_database_url\(\)[\s\S]*?printf 'postgresql:\/\/%s@localhost:5432\/%s\?schema=%s'/,
  )
  assert.match(
    deployScript,
    /prepare_shared_owner_migration_env\(\)[\s\S]*?export PORTAL_DB_URL="\$\(build_owner_database_url "\$owner_role" "\$database_name" "\$schema_name"\)"/,
  )
  assert.match(
    deployScript,
    /prepare_shared_owner_migration_env\(\)[\s\S]*?export DATABASE_URL="\$\(build_owner_database_url "\$owner_role" "\$database_name" "\$schema_name"\)"/,
  )
})

test('atlas dev deploy no longer falls back to db push on migrate errors', () => {
  assert.doesNotMatch(
    deployScript,
    /Prisma migrate deploy failed for atlas dev; falling back to non-destructive db push/,
  )
})
