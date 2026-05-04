/** @type {import('next').NextConfig} */
const { execFileSync } = require('child_process')
const path = require('path')

const repoRoot = path.resolve(__dirname, '../..')

function readNonEmptyEnv(name) {
  const value = process.env[name]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

function runGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim()
}

function parseSemverTag(tag) {
  const match = /^v([0-9]+)\.([0-9]+)\.([0-9]+)$/.exec(tag)
  if (!match) {
    return undefined
  }

  return {
    major: Number(match[1]),
    minor: Number(match[2]),
    patch: Number(match[3]),
    tag,
    version: `${match[1]}.${match[2]}.${match[3]}`,
  }
}

function compareSemver(left, right) {
  if (left.major !== right.major) {
    return left.major - right.major
  }

  if (left.minor !== right.minor) {
    return left.minor - right.minor
  }

  return left.patch - right.patch
}

function resolveLatestSemverTag() {
  const output = runGit(['tag', '--list', 'v[0-9]*.[0-9]*.[0-9]*'])
  const parsedTags = output
    .split('\n')
    .map((tag) => parseSemverTag(tag.trim()))
    .filter((tag) => tag !== undefined)
    .sort(compareSemver)

  const latest = parsedTags.at(-1)
  if (latest === undefined) {
    throw new Error('Cannot resolve TargonOS version: no strict semver tags found.')
  }

  return latest
}

function resolveBump(commitMessages) {
  if (/BREAKING CHANGE|^[a-zA-Z]+(\(.+\))?!:/m.test(commitMessages)) {
    return 'major'
  }

  if (/^feat(\(.+\))?:/m.test(commitMessages)) {
    return 'minor'
  }

  return 'patch'
}

function bumpVersion(base, bump) {
  if (bump === 'major') {
    return `${base.major + 1}.0.0`
  }

  if (bump === 'minor') {
    return `${base.major}.${base.minor + 1}.0`
  }

  return `${base.major}.${base.minor}.${base.patch + 1}`
}

function resolveLocalBuildMetadata() {
  const headSha = runGit(['rev-parse', 'HEAD'])
  const latest = resolveLatestSemverTag()
  const latestTagSha = runGit(['rev-list', '-n', '1', latest.tag])

  if (latestTagSha === headSha) {
    return {
      commitSha: headSha,
      releaseUrl: `https://github.com/progami/targonos/releases/tag/${latest.tag}`,
      version: latest.version,
    }
  }

  const commitMessages = runGit(['log', `${latest.tag}..HEAD`, '--pretty=%s%n%b'])
  const bump = resolveBump(commitMessages)

  return {
    commitSha: headSha,
    releaseUrl: `https://github.com/progami/targonos/commit/${headSha}`,
    version: bumpVersion(latest, bump),
  }
}

function resolveBuildMetadata() {
  const explicitVersion = readNonEmptyEnv('NEXT_PUBLIC_VERSION')
  if (explicitVersion !== undefined) {
    return {
      commitSha: readNonEmptyEnv('NEXT_PUBLIC_COMMIT_SHA'),
      releaseUrl: readNonEmptyEnv('NEXT_PUBLIC_RELEASE_URL'),
      version: explicitVersion,
    }
  }

  return resolveLocalBuildMetadata()
}

const buildMetadata = resolveBuildMetadata()

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_VERSION: buildMetadata.version,
    NEXT_PUBLIC_RELEASE_URL: buildMetadata.releaseUrl,
    NEXT_PUBLIC_COMMIT_SHA: buildMetadata.commitSha,
    NEXT_PUBLIC_PORTAL_AUTH_URL: process.env.NEXT_PUBLIC_PORTAL_AUTH_URL,
  },
  async redirects() {
    return [
      {
        source: '/amazon/fba-fee-discrepancies',
        destination: '/talos/amazon/fba-fee-discrepancies',
        permanent: false,
      },
    ]
  },
  // Turbopack is the default bundler in Next.js 16
  turbopack: {
    resolveAlias: {
      '@targon/auth': '../../packages/auth/dist/index.js',
    },
  },
}

module.exports = nextConfig
