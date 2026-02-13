#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const ROOT_DIR = path.resolve(__dirname, '..')
const APPS_DIR = path.join(ROOT_DIR, 'apps')
const APP_MANIFEST_PATH = path.join(ROOT_DIR, 'app-manifest.json')
const APP_TSCONFIG_FILENAME = 'tsconfig.json'
const EXPECTED_APP_EXTENDS = '../../tsconfig.nextjs.json'
const SHARED_NEXT_CONFIG_PATH = path.join(ROOT_DIR, 'tsconfig.nextjs.json')
const EXPECTED_NEXT_EXTENDS = './tsconfig.base.json'

const DISALLOWED_DUPLICATE_KEYS = [
  'lib',
  'incremental',
  'esModuleInterop',
  'resolveJsonModule',
  'isolatedModules',
  'plugins',
]

const errors = []
const appManifest = JSON.parse(fs.readFileSync(APP_MANIFEST_PATH, 'utf8'))
const activeAppNames = Object.entries(appManifest.apps)
  .filter(([, appConfig]) => appConfig.lifecycle === 'active')
  .map(([appName]) => appName)
  .sort()

for (const appName of activeAppNames) {
  const appDirectoryPath = path.join(APPS_DIR, appName)
  if (!fs.existsSync(appDirectoryPath)) {
    errors.push(`apps/${appName} is marked active in app-manifest.json but directory is missing.`)
    continue
  }

  const appTsconfigPath = path.join(appDirectoryPath, APP_TSCONFIG_FILENAME)
  if (!fs.existsSync(appTsconfigPath)) {
    errors.push(`apps/${appName}/${APP_TSCONFIG_FILENAME} is missing.`)
    continue
  }

  const appTsconfig = JSON.parse(fs.readFileSync(appTsconfigPath, 'utf8'))
  if (appTsconfig.extends !== EXPECTED_APP_EXTENDS) {
    errors.push(
      `apps/${appName}/${APP_TSCONFIG_FILENAME} must extend "${EXPECTED_APP_EXTENDS}", found "${appTsconfig.extends ?? 'none'}".`,
    )
  }

  const compilerOptions = appTsconfig.compilerOptions || {}
  for (const key of DISALLOWED_DUPLICATE_KEYS) {
    if (Object.hasOwn(compilerOptions, key)) {
      errors.push(
        `apps/${appName}/${APP_TSCONFIG_FILENAME} should not redefine compilerOptions.${key}; keep it in ${EXPECTED_APP_EXTENDS}.`,
      )
    }
  }
}

if (!fs.existsSync(SHARED_NEXT_CONFIG_PATH)) {
  errors.push('tsconfig.nextjs.json is missing.')
} else {
  const sharedNextConfig = JSON.parse(fs.readFileSync(SHARED_NEXT_CONFIG_PATH, 'utf8'))
  if (sharedNextConfig.extends !== EXPECTED_NEXT_EXTENDS) {
    errors.push(`tsconfig.nextjs.json must extend "${EXPECTED_NEXT_EXTENDS}", found "${sharedNextConfig.extends ?? 'none'}".`)
  }
}

if (errors.length > 0) {
  console.error('[check-app-tsconfig] Found configuration drift:')
  for (const error of errors) {
    console.error(`- ${error}`)
  }
  process.exit(1)
}

console.log('[check-app-tsconfig] App tsconfig inheritance is valid.')
