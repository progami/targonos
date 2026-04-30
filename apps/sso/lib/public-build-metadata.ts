const publicBuildEnv = {
  NEXT_PUBLIC_COMMIT_SHA: process.env.NEXT_PUBLIC_COMMIT_SHA,
  NEXT_PUBLIC_RELEASE_URL: process.env.NEXT_PUBLIC_RELEASE_URL,
  NEXT_PUBLIC_VERSION: process.env.NEXT_PUBLIC_VERSION,
}

function readPublicEnv(name: keyof typeof publicBuildEnv): string | undefined {
  const value = publicBuildEnv[name]
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmed = value.trim()
  return trimmed === '' ? undefined : trimmed
}

export function getPublicVersion(): string {
  const version = readPublicEnv('NEXT_PUBLIC_VERSION')
  if (version === undefined) {
    throw new Error('NEXT_PUBLIC_VERSION is required.')
  }

  return version
}

export function getPublicVersionHref(): string {
  const releaseUrl = readPublicEnv('NEXT_PUBLIC_RELEASE_URL')
  if (releaseUrl !== undefined) {
    return releaseUrl
  }

  const commitSha = readPublicEnv('NEXT_PUBLIC_COMMIT_SHA')
  if (commitSha !== undefined) {
    return `https://github.com/progami/targonos/commit/${commitSha}`
  }

  throw new Error('NEXT_PUBLIC_RELEASE_URL or NEXT_PUBLIC_COMMIT_SHA is required.')
}
