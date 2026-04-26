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

test('hosted deploys load exact shared and app env files without .env.local fallback', () => {
  assert.match(
    deployScript,
    /load_selected_app_env\(\)[\s\S]*?if ! exports="\$\(node "\$REPO_DIR\/scripts\/load-app-env\.js" --app "\$app_key" --mode "\$shared_env_mode"\)"; then/,
  )
  assert.doesNotMatch(
    deployScript,
    /candidates=\("\$app_dir\/.env.production" "\$app_dir\/.env.local" "\$app_dir\/.env"\)/,
  )
  assert.doesNotMatch(
    deployScript,
    /candidates=\("\$app_dir\/.env.local" "\$app_dir\/.env.dev" "\$app_dir\/.env.dev.ci" "\$app_dir\/.env"\)/,
  )
  assert.doesNotMatch(
    deployScript,
    /candidates=\("\$sso_dir\/.env.production" "\$sso_dir\/.env.local" "\$sso_dir\/.env"\)/,
  )
  assert.doesNotMatch(
    deployScript,
    /candidates=\("\$sso_dir\/.env.local" "\$sso_dir\/.env.dev" "\$sso_dir\/.env.dev.ci" "\$sso_dir\/.env"\)/,
  )
})

test('argus deploy requires explicit media backend before prebuild repair', () => {
  assert.match(
    deployScript,
    /normalize_argus_media_backend\(\)[\s\S]*?error "ARGUS_MEDIA_BACKEND is required for argus deployments"/,
  )
  assert.match(
    deployScript,
    /if \[\[ "\$media_backend" == "s3" \]\]; then[\s\S]*?Skipping Argus local media repair/,
  )
})

test('hermes hosted deploy rejects runtime auto migration', () => {
  assert.match(
    deployScript,
    /validate_hermes_env\(\)[\s\S]*?HERMES_AUTO_MIGRATE must be 0 for hosted hermes deployments/,
  )
  assert.match(
    deployScript,
    /if \[\[ "\$app_key" == "hermes" \]\]; then\s+validate_hermes_env\s+fi/,
  )
})

test('pm2 starts scrub workflow-inherited database and hosted runtime env', () => {
  const match = deployScript.match(/run_pm2_sanitized\(\) \{[\s\S]*?\n\}/)
  assert.ok(match, 'run_pm2_sanitized block should exist')
  const block = match[0]

  for (const key of [
    'DATABASE_URL',
    'DATABASE_URL_US',
    'DATABASE_URL_UK',
    'PORTAL_DB_URL',
    'PGHOSTADDR',
    'PGPASSFILE',
    'PGSERVICE',
    'PGSERVICEFILE',
    'PGSSLMODE',
    'PGSSLCERT',
    'PGSSLKEY',
    'PGSSLROOTCERT',
    'PGUSER',
    'PGPASSWORD',
    'PGDATABASE',
    'PGHOST',
    'PGPORT',
    'PGOPTIONS',
    'NODE_ENV',
    'PORT',
    'HOST',
    'BASE_PATH',
    'NEXT_PUBLIC_BASE_PATH',
    'NEXT_PUBLIC_APP_URL',
    'BASE_URL',
    'PORTAL_AUTH_URL',
    'NEXT_PUBLIC_PORTAL_AUTH_URL',
    'PORTAL_APPS_BASE_URL',
    'NEXT_PUBLIC_PORTAL_APPS_BASE_URL',
    'NEXTAUTH_URL',
    'PORTAL_AUTH_SECRET',
    'NEXTAUTH_SECRET',
    'COOKIE_DOMAIN',
    'CSRF_ALLOWED_ORIGINS',
  ]) {
    assert.match(block, new RegExp(`${key}=\\s*\\\\`))
  }
})

test('standalone Next deploys copy generated static and public assets before PM2 starts', () => {
  assert.match(
    deployScript,
    /sync_next_standalone_assets\(\)[\s\S]*?rsync -a --delete "\$app_dir\/.next\/static\/" "\$standalone_app_dir\/.next\/static\/"/,
  )
  assert.match(
    deployScript,
    /sync_next_standalone_assets\(\)[\s\S]*?rsync -a --delete "\$app_dir\/public\/" "\$standalone_app_dir\/public\/"/,
  )
  assert.match(
    deployScript,
    /log "Build complete"[\s\S]*?sync_next_standalone_assets[\s\S]*?log "Step 7: Starting \$pm2_name"/,
  )
})
