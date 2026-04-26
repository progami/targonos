import { execFileSync, spawnSync } from 'node:child_process'
import { appendFileSync, existsSync, mkdirSync, readFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  CLOUDFLARED_CONFIG_PATH,
  CLOUDFLARED_METRICS_ADDRESS,
  CLOUDFLARED_PROGRAM,
  CLOUDFLARED_TUNNEL_ID,
  CLOUDFLARED_TUNNEL_LABEL,
  cloudflaredTunnelProgramArguments,
  hasRequiredTunnelRunArguments,
} from './cloudflared-tunnel-launchd.mjs'

const REQUIRED = true
const OPTIONAL = false

export const HOST_ENVIRONMENTS = {
  main: {
    portalOrigin: 'https://os.targonglobal.com',
    nginxBaseUrl: 'http://127.0.0.1:8080',
    websiteBaseUrl: 'http://127.0.0.1:8082',
    portalProcess: 'main-targonos',
    webProcesses: [
      'main-targonos',
      'main-talos',
      'main-website',
      'main-atlas',
      'main-xplan',
      'main-kairos',
      'main-kairos-ml',
      'main-plutus',
      'main-hermes',
      'main-argus',
    ],
    workerProcesses: [
      'main-plutus-cashflow-refresh',
      'main-plutus-settlement-sync',
      'main-hermes-orders-sync',
      'main-hermes-request-review',
    ],
    mountedApps: [
      ['main-targonos', ''],
      ['main-talos', '/talos'],
      ['main-xplan', '/xplan'],
      ['main-atlas', '/atlas'],
      ['main-kairos', '/kairos'],
      ['main-plutus', '/plutus'],
      ['main-hermes', '/hermes'],
      ['main-argus', '/argus'],
    ],
    websiteProcess: 'main-website',
  },
  dev: {
    portalOrigin: 'https://dev-os.targonglobal.com',
    nginxBaseUrl: 'http://127.0.0.1:8081',
    websiteBaseUrl: 'http://127.0.0.1:8083',
    portalProcess: 'dev-targonos',
    webProcesses: [
      'dev-targonos',
      'dev-talos',
      'dev-website',
      'dev-atlas',
      'dev-xplan',
      'dev-kairos',
      'dev-kairos-ml',
      'dev-plutus',
      'dev-hermes',
      'dev-argus',
    ],
    workerProcesses: [
      'dev-plutus-cashflow-refresh',
      'dev-plutus-settlement-sync',
      'dev-hermes-orders-sync',
      'dev-hermes-request-review',
    ],
    mountedApps: [
      ['dev-targonos', ''],
      ['dev-talos', '/talos'],
      ['dev-xplan', '/xplan'],
      ['dev-atlas', '/atlas'],
      ['dev-kairos', '/kairos'],
      ['dev-plutus', '/plutus'],
      ['dev-hermes', '/hermes'],
      ['dev-argus', '/argus'],
    ],
    websiteProcess: 'dev-website',
  },
}

const appRoutes = ['/talos/', '/xplan/', '/atlas/', '/kairos/', '/plutus/', '/hermes/', '/argus/']

export function parseCloudflaredReady(raw) {
  const payload = JSON.parse(raw)
  const readyConnections = payload.readyConnections
  if (!Number.isInteger(readyConnections)) {
    throw new Error('readyConnections is missing or not an integer')
  }

  return readyConnections
}

export function httpCodeIsAvailable(code) {
  return Number.isInteger(code) && code >= 200 && code < 500
}

export function httpCodeIsSuccess(code) {
  return Number.isInteger(code) && code >= 200 && code < 400
}

export function parsePm2Processes(pm2Json) {
  const entries = JSON.parse(pm2Json)
  if (!Array.isArray(entries)) {
    throw new Error('pm2 jlist did not return an array')
  }

  return new Map(entries.map((entry) => [entry.name, entry]))
}

export function parseLaunchdArguments(launchdOutput) {
  const lines = launchdOutput.split('\n')
  const argumentsStart = lines.findIndex((line) => line.trim() === 'arguments = {')
  if (argumentsStart === -1) {
    throw new Error('launchd output is missing arguments block')
  }

  const args = []
  for (let index = argumentsStart + 1; index < lines.length; index += 1) {
    const value = lines[index].trim()
    if (value === '}') {
      return args
    }

    if (value !== '') {
      args.push(value)
    }
  }

  throw new Error('launchd output has unterminated arguments block')
}

export function processIsOnline(entry) {
  const status = entry?.pm2_env?.status
  const pid = entry?.pid
  return status === 'online' && Number.isInteger(pid) && pid > 0
}

export function repoRootFromPm2Process(entry) {
  const cwd = entry?.pm2_env?.pm_cwd
  if (typeof cwd !== 'string') {
    throw new Error('pm2 process is missing pm_cwd')
  }

  return path.dirname(path.dirname(cwd))
}

export function nextBuildManifestUrl({ baseUrl, basePath, cwd }) {
  const buildIdPath = path.join(cwd, '.next', 'BUILD_ID')
  if (!existsSync(buildIdPath)) {
    throw new Error(`missing BUILD_ID at ${buildIdPath}`)
  }

  const buildId = readFileSync(buildIdPath, 'utf8').trim()
  if (buildId === '') {
    throw new Error(`empty BUILD_ID at ${buildIdPath}`)
  }

  return `${baseUrl}${basePath}/_next/static/${buildId}/_buildManifest.js`
}

export function extractPortalVersionBadge(html) {
  const versionMatch = html.match(/TargonOS v<!-- -->(([0-9]+)\.([0-9]+)\.([0-9]+))/)
  const hrefMatch = html.match(/href="([^"]*(?:github\.com\/progami\/targonos)[^"]*)"/)
  return {
    version: versionMatch?.[1],
    href: hrefMatch?.[1],
  }
}

function run(command, args, options = {}) {
  const timeout = options.timeout ?? 10_000
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout,
    maxBuffer: 10 * 1024 * 1024,
  })

  return {
    command,
    args,
    status: result.status,
    signal: result.signal,
    stdout: result.stdout.trim(),
    stderr: result.stderr.trim(),
    error: result.error,
  }
}

function httpStatus(url, { followRedirects = false } = {}) {
  const args = ['-sS', '-o', '/dev/null', '-w', '%{http_code}', '--max-time', '10']
  if (followRedirects) {
    args.push('-L')
  }
  args.push(url)
  const result = run('curl', args, { timeout: 15_000 })
  if (result.status !== 0) {
    return { code: 0, detail: result.stderr }
  }

  return { code: Number.parseInt(result.stdout, 10), detail: result.stdout }
}

function httpBody(url) {
  const result = run('curl', ['-fsS', '--max-time', '10', url], { timeout: 15_000 })
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }

  return result.stdout
}

function pass(layer, name, detail, required = REQUIRED) {
  return { layer, name, status: 'PASS', detail, required }
}

function fail(layer, name, detail, required = REQUIRED) {
  return { layer, name, status: 'FAIL', detail, required }
}

function warn(layer, name, detail) {
  return { layer, name, status: 'WARN', detail, required: OPTIONAL }
}

function checkBrewService(serviceName) {
  const result = run('brew', ['services', 'list'], { timeout: 20_000 })
  if (result.status !== 0) {
    return fail('brew', serviceName, result.stderr)
  }

  const line = result.stdout.split('\n').find((entry) => entry.trim().startsWith(`${serviceName} `))
  if (line === undefined) {
    return fail('brew', serviceName, 'service missing from brew services list')
  }

  const fields = line.trim().split(/\s+/)
  const status = fields[1]
  if (status !== 'started') {
    return fail('brew', serviceName, `status=${status}`)
  }

  return pass('brew', serviceName, 'started')
}

function checkLaunchdTunnel() {
  const result = run('launchctl', ['print', `gui/${process.getuid()}/${CLOUDFLARED_TUNNEL_LABEL}`])
  if (result.status !== 0) {
    return fail('launchd', CLOUDFLARED_TUNNEL_LABEL, result.stderr)
  }

  let launchdArgs
  try {
    launchdArgs = parseLaunchdArguments(result.stdout)
  } catch (error) {
    return fail('launchd', CLOUDFLARED_TUNNEL_LABEL, error.message)
  }

  if (!hasRequiredTunnelRunArguments(launchdArgs)) {
    const expected = cloudflaredTunnelProgramArguments().join(' ')
    return fail('launchd', CLOUDFLARED_TUNNEL_LABEL, `ProgramArguments mismatch; expected ${expected}`)
  }

  if (!result.stdout.includes('state = running')) {
    return fail('launchd', CLOUDFLARED_TUNNEL_LABEL, 'service is not running')
  }

  return pass('launchd', CLOUDFLARED_TUNNEL_LABEL, 'running with explicit tunnel run command')
}

function checkCloudflaredReady() {
  const url = `http://${CLOUDFLARED_METRICS_ADDRESS}/ready`
  const result = run('curl', ['-fsS', '--max-time', '5', url], { timeout: 10_000 })
  if (result.status !== 0) {
    return fail('cloudflared', 'ready', `${url} failed: ${result.stderr}`)
  }

  try {
    const readyConnections = parseCloudflaredReady(result.stdout)
    if (readyConnections < 1) {
      return fail('cloudflared', 'ready', `readyConnections=${readyConnections}`)
    }

    return pass('cloudflared', 'ready', `readyConnections=${readyConnections}`)
  } catch (error) {
    return fail('cloudflared', 'ready', error.message)
  }
}

function checkCloudflaredTunnelInfo() {
  const result = run(CLOUDFLARED_PROGRAM, ['tunnel', 'info', CLOUDFLARED_TUNNEL_ID], { timeout: 20_000 })
  if (result.status !== 0) {
    return fail('cloudflared', 'tunnel-info', result.stderr)
  }

  if (result.stdout.includes('does not have any active connection')) {
    return fail('cloudflared', 'tunnel-info', 'Cloudflare reports no active connection')
  }

  return pass('cloudflared', 'tunnel-info', `active tunnel ${CLOUDFLARED_TUNNEL_ID}`)
}

function checkCloudflaredConfig() {
  const result = run(CLOUDFLARED_PROGRAM, ['tunnel', '--config', CLOUDFLARED_CONFIG_PATH, 'ingress', 'validate'], { timeout: 20_000 })
  if (result.status !== 0) {
    return fail('cloudflared', 'config', result.stderr)
  }

  return pass('cloudflared', 'config', 'ingress config valid')
}

function checkHttpRoute(layer, name, url, successPredicate = httpCodeIsAvailable, options = {}) {
  const { code, detail } = httpStatus(url, options)
  if (!successPredicate(code)) {
    return fail(layer, name, `${url} code=${code} detail=${detail}`)
  }

  return pass(layer, name, `${url} code=${code}`)
}

function checkPm2Process(name, pm2Processes, layer = 'pm2') {
  const entry = pm2Processes.get(name)
  if (entry === undefined) {
    return fail(layer, name, 'missing from pm2 jlist')
  }

  if (!processIsOnline(entry)) {
    const status = entry.pm2_env?.status
    const pid = entry.pid
    return fail(layer, name, `status=${status} pid=${pid}`)
  }

  return pass(layer, name, `pid=${entry.pid}`)
}

function checkNextManifest({ pm2Name, basePath, baseUrl, pm2Processes }) {
  const entry = pm2Processes.get(pm2Name)
  if (entry === undefined) {
    return fail('manifest', pm2Name, 'missing from pm2 jlist')
  }

  try {
    const url = nextBuildManifestUrl({
      baseUrl,
      basePath,
      cwd: entry.pm2_env.pm_cwd,
    })
    return checkHttpRoute('manifest', pm2Name, url, (code) => code === 200, { followRedirects: true })
  } catch (error) {
    return fail('manifest', pm2Name, error.message)
  }
}

function checkDeployLocks(environmentName, environment, pm2Processes) {
  const portalEntry = pm2Processes.get(environment.portalProcess)
  if (portalEntry === undefined) {
    return fail('deploy-lock', environmentName, `${environment.portalProcess} missing from pm2`)
  }

  try {
    const root = repoRootFromPm2Process(portalEntry)
    const lockDir = path.join(root, 'tmp', 'deploy-locks')
    if (!existsSync(lockDir)) {
      return pass('deploy-lock', environmentName, `${lockDir} absent`)
    }

    const entries = execFileSync('find', [lockDir, '-mindepth', '1', '-maxdepth', '1', '-print'], { encoding: 'utf8' })
      .trim()
      .split('\n')
      .filter((entry) => entry.length > 0)

    if (entries.length > 0) {
      return fail('deploy-lock', environmentName, `stale locks: ${entries.join(', ')}`)
    }

    return pass('deploy-lock', environmentName, `${lockDir} empty`)
  } catch (error) {
    return fail('deploy-lock', environmentName, error.message)
  }
}

function checkPortalMetadata(environmentName, environment, pm2Processes) {
  const entry = pm2Processes.get(environment.portalProcess)
  if (entry === undefined) {
    return fail('deploy-metadata', environmentName, `${environment.portalProcess} missing from pm2`)
  }

  const env = entry.pm2_env
  const requiredKeys = [
    'NEXT_PUBLIC_VERSION',
    'NEXT_PUBLIC_RELEASE_URL',
    'NEXT_PUBLIC_COMMIT_SHA',
    'BUILD_TIME',
    'NEXT_PUBLIC_BUILD_TIME',
  ]

  const missing = requiredKeys.filter((key) => {
    const value = env[key]
    return typeof value !== 'string' || value.trim() === ''
  })
  if (missing.length > 0) {
    return fail('deploy-metadata', environmentName, `missing ${missing.join(', ')}`)
  }

  try {
    const html = httpBody(`${environment.nginxBaseUrl}/`)
    const badge = extractPortalVersionBadge(html)
    if (badge.version !== env.NEXT_PUBLIC_VERSION) {
      return fail('deploy-metadata', environmentName, `badge=${badge.version} env=${env.NEXT_PUBLIC_VERSION}`)
    }

    if (typeof badge.href !== 'string' || !badge.href.includes(env.NEXT_PUBLIC_COMMIT_SHA)) {
      if (!env.NEXT_PUBLIC_RELEASE_URL.includes(`/tag/v${env.NEXT_PUBLIC_VERSION}`)) {
        return fail('deploy-metadata', environmentName, 'version badge href does not match commit or release metadata')
      }
    }

    return pass('deploy-metadata', environmentName, `version=${env.NEXT_PUBLIC_VERSION} commit=${env.NEXT_PUBLIC_COMMIT_SHA}`)
  } catch (error) {
    return fail('deploy-metadata', environmentName, error.message)
  }
}

function checkPostgres() {
  const result = run('pg_isready', ['-h', '127.0.0.1', '-p', '5432', '-d', 'portal_db'])
  if (result.status !== 0) {
    return fail('db', 'postgresql@14', result.stdout + result.stderr)
  }

  return pass('db', 'postgresql@14', result.stdout)
}

function checkPgBouncer() {
  const result = run('pg_isready', ['-h', '127.0.0.1', '-p', '6432', '-d', 'portal_db_hermes'])
  if (result.status !== 0) {
    return fail('db', 'pgbouncer', result.stdout + result.stderr)
  }

  return pass('db', 'pgbouncer', result.stdout)
}

function checkRedis() {
  const result = run('redis-cli', ['-h', '127.0.0.1', 'ping'])
  if (result.status !== 0) {
    return fail('redis', 'redis', result.stderr)
  }

  if (result.stdout !== 'PONG') {
    return fail('redis', 'redis', result.stdout)
  }

  return pass('redis', 'redis', 'PONG')
}

function loadPm2Processes() {
  const result = run('pm2', ['jlist'], { timeout: 20_000 })
  if (result.status !== 0) {
    throw new Error(result.stderr)
  }

  return parsePm2Processes(result.stdout)
}

function environmentNamesFromArg(value) {
  if (value === 'all') {
    return ['main', 'dev']
  }

  if (HOST_ENVIRONMENTS[value] !== undefined) {
    return [value]
  }

  throw new Error(`Unsupported --env value: ${value}`)
}

function parseArgs(argv) {
  let env = 'all'
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]
    if (arg === '--env') {
      const value = argv[index + 1]
      if (value === undefined) {
        throw new Error('--env requires a value')
      }
      env = value
      index += 1
      continue
    }

    throw new Error(`Unsupported argument: ${arg}`)
  }

  return { env }
}

function checkEnvironment(environmentName, environment, pm2Processes) {
  const results = []
  results.push(checkHttpRoute('nginx', `${environmentName}:root`, `${environment.nginxBaseUrl}/`))
  for (const route of appRoutes) {
    results.push(checkHttpRoute('nginx', `${environmentName}:${route}`, `${environment.nginxBaseUrl}${route}`))
  }

  results.push(checkHttpRoute('nginx', `${environmentName}:website`, `${environment.websiteBaseUrl}/`))

  for (const processName of environment.webProcesses) {
    results.push(checkPm2Process(processName, pm2Processes, 'pm2-web'))
  }

  for (const processName of environment.workerProcesses) {
    results.push(checkPm2Process(processName, pm2Processes, 'pm2-worker'))
  }

  for (const [pm2Name, basePath] of environment.mountedApps) {
    results.push(checkNextManifest({
      pm2Name,
      basePath,
      baseUrl: environment.nginxBaseUrl,
      pm2Processes,
    }))
  }

  results.push(checkNextManifest({
    pm2Name: environment.websiteProcess,
    basePath: '',
    baseUrl: environment.websiteBaseUrl,
    pm2Processes,
  }))

  results.push(checkHttpRoute('external', environmentName, `${environment.portalOrigin}/`, httpCodeIsSuccess))
  results.push(checkDeployLocks(environmentName, environment, pm2Processes))
  results.push(checkPortalMetadata(environmentName, environment, pm2Processes))
  return results
}

function formatTable(results) {
  const rows = [
    ['STATUS', 'REQ', 'LAYER', 'NAME', 'DETAIL'],
    ...results.map((result) => [
      result.status,
      result.required ? 'yes' : 'no',
      result.layer,
      result.name,
      result.detail,
    ]),
  ]
  const widths = rows[0].map((_, columnIndex) => Math.max(...rows.map((row) => row[columnIndex].length)))
  return rows
    .map((row) => row.map((value, columnIndex) => value.padEnd(widths[columnIndex])).join('  '))
    .join('\n')
}

function writeHealthLog(results) {
  const logPath = path.join(os.homedir(), 'Library', 'Logs', 'targonos-host-health.jsonl')
  mkdirSync(path.dirname(logPath), { recursive: true })
  const requiredFailures = results.filter((result) => result.required && result.status === 'FAIL')
  appendFileSync(logPath, `${JSON.stringify({
    checkedAt: new Date().toISOString(),
    ok: requiredFailures.length === 0,
    requiredFailures: requiredFailures.length,
    results,
  })}\n`)
  return logPath
}

export async function verifyHostStack({ env = 'all' } = {}) {
  const environmentNames = environmentNamesFromArg(env)
  const results = []

  results.push(checkCloudflaredConfig())
  results.push(checkLaunchdTunnel())
  results.push(checkCloudflaredReady())
  results.push(checkCloudflaredTunnelInfo())

  for (const serviceName of ['nginx', 'redis', 'pgbouncer', 'postgresql@14']) {
    results.push(checkBrewService(serviceName))
  }

  results.push(checkPostgres())
  results.push(checkPgBouncer())
  results.push(checkRedis())

  let pm2Processes
  try {
    pm2Processes = loadPm2Processes()
  } catch (error) {
    results.push(fail('pm2', 'jlist', error.message))
    return results
  }

  for (const environmentName of environmentNames) {
    results.push(...checkEnvironment(environmentName, HOST_ENVIRONMENTS[environmentName], pm2Processes))
  }

  return results
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const results = await verifyHostStack(args)
  const logPath = writeHealthLog(results)
  console.log(formatTable(results))
  console.log(`health_log=${logPath}`)

  const requiredFailures = results.filter((result) => result.required && result.status === 'FAIL')
  if (requiredFailures.length > 0) {
    process.exit(1)
  }
}

const modulePath = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  await main()
}
