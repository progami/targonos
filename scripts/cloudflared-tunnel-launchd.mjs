import { fileURLToPath } from 'node:url'
import os from 'node:os'
import path from 'node:path'

export const CLOUDFLARED_TUNNEL_LABEL = 'com.targonglobal.cloudflared-tunnel'
export const CLOUDFLARED_TUNNEL_ID = 'cdb60dd3-b875-4735-9f5d-21ebc0f42b46'
export const CLOUDFLARED_CONFIG_PATH = path.join(os.homedir(), '.cloudflared', 'config.yml')
export const CLOUDFLARED_METRICS_ADDRESS = '127.0.0.1:20241'
export const CLOUDFLARED_PROGRAM = '/opt/homebrew/opt/cloudflared/bin/cloudflared'

export function cloudflaredTunnelProgramArguments({
  program = CLOUDFLARED_PROGRAM,
  configPath = CLOUDFLARED_CONFIG_PATH,
  metricsAddress = CLOUDFLARED_METRICS_ADDRESS,
  tunnelId = CLOUDFLARED_TUNNEL_ID,
} = {}) {
  return [
    program,
    'tunnel',
    '--config',
    configPath,
    '--metrics',
    metricsAddress,
    'run',
    tunnelId,
  ]
}

export function hasRequiredTunnelRunArguments(args, {
  configPath = CLOUDFLARED_CONFIG_PATH,
  metricsAddress = CLOUDFLARED_METRICS_ADDRESS,
  tunnelId = CLOUDFLARED_TUNNEL_ID,
} = {}) {
  const expected = cloudflaredTunnelProgramArguments({
    program: args.at(0),
    configPath,
    metricsAddress,
    tunnelId,
  })

  if (args.length !== expected.length) {
    return false
  }

  return expected.every((value, index) => args[index] === value)
}

function escapeXml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;')
}

function stringEntry(value) {
  return `      <string>${escapeXml(value)}</string>`
}

export function renderCloudflaredTunnelPlist({
  label = CLOUDFLARED_TUNNEL_LABEL,
  programArguments = cloudflaredTunnelProgramArguments(),
  stdoutPath = '/Users/jarraramjad/Library/Logs/cloudflared-tunnel.out.log',
  stderrPath = '/Users/jarraramjad/Library/Logs/cloudflared-tunnel.err.log',
} = {}) {
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict>
    <key>Label</key>
    <string>${escapeXml(label)}</string>
    <key>ProgramArguments</key>
    <array>
${programArguments.map(stringEntry).join('\n')}
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
    <key>ThrottleInterval</key>
    <integer>30</integer>
    <key>StandardOutPath</key>
    <string>${escapeXml(stdoutPath)}</string>
    <key>StandardErrorPath</key>
    <string>${escapeXml(stderrPath)}</string>
  </dict>
</plist>
`
}

function parseRenderArgs(argv) {
  const options = {}
  for (let index = 0; index < argv.length; index += 1) {
    const name = argv[index]
    const value = argv[index + 1]
    if (value === undefined) {
      throw new Error(`${name} requires a value.`)
    }

    if (name === '--stdout') {
      options.stdoutPath = value
      index += 1
      continue
    }

    if (name === '--stderr') {
      options.stderrPath = value
      index += 1
      continue
    }

    if (name === '--program') {
      options.program = value
      index += 1
      continue
    }

    if (name === '--config') {
      options.configPath = value
      index += 1
      continue
    }

    if (name === '--metrics') {
      options.metricsAddress = value
      index += 1
      continue
    }

    if (name === '--tunnel-id') {
      options.tunnelId = value
      index += 1
      continue
    }

    throw new Error(`Unsupported argument: ${name}`)
  }

  return options
}

function main() {
  const [command, ...args] = process.argv.slice(2)
  if (command !== 'render') {
    throw new Error('Usage: node scripts/cloudflared-tunnel-launchd.mjs render [--stdout path] [--stderr path]')
  }

  const options = parseRenderArgs(args)
  const programArguments = cloudflaredTunnelProgramArguments({
    program: options.program,
    configPath: options.configPath,
    metricsAddress: options.metricsAddress,
    tunnelId: options.tunnelId,
  })
  process.stdout.write(renderCloudflaredTunnelPlist({
    programArguments,
    stdoutPath: options.stdoutPath,
    stderrPath: options.stderrPath,
  }))
}

const modulePath = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  main()
}
