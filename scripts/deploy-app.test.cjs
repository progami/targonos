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

test('sso deploy rewrites auth migrations onto the portal owner connection', () => {
  assert.match(
    deployScript,
    /prepare_portal_owner_migration_env\(\)[\s\S]*?PORTAL_ADMIN_DATABASE_URL[\s\S]*?apps\/sso\/\.env\.production[\s\S]*?rewrite_database_url "\$raw_portal_admin_url" "portal_db_dev" "auth_dev"/,
  )
  assert.match(
    deployScript,
    /prepare_portal_owner_migration_env[\s\S]*?rewrite_database_url "\$raw_portal_admin_url" "portal_db" "auth"/,
  )
})
