function requireEnv(name) {
  const value = process.env[name]
  if (typeof value !== 'string') {
    throw new Error(`${name} must be defined for review thread assertions.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${name} must be defined for review thread assertions.`)
  }

  return trimmed
}

function truncate(value, maxLength = 140) {
  const normalized = value.replace(/\s+/g, ' ').trim()
  if (normalized.length <= maxLength) {
    return normalized
  }

  return `${normalized.slice(0, maxLength - 1)}…`
}

function requireNonEmptyString(value, description) {
  if (typeof value !== 'string') {
    throw new Error(`${description} must be a non-empty string.`)
  }

  const trimmed = value.trim()
  if (trimmed === '') {
    throw new Error(`${description} must be a non-empty string.`)
  }

  return trimmed
}

function summarizeBlockingThread(thread) {
  const path = requireNonEmptyString(thread.path, 'Blocking review thread path')

  if (!Array.isArray(thread.comments) || thread.comments.length === 0) {
    throw new Error(`Blocking review thread ${path} must include a first comment.`)
  }

  const firstComment = thread.comments[0]
  const authorLogin = requireNonEmptyString(firstComment.author?.login, `Blocking review thread ${path} first comment author login`)
  const body = truncate(requireNonEmptyString(firstComment.body, `Blocking review thread ${path} first comment body`))
  const location = typeof thread.line === 'number'
    ? `${path}:${thread.line}`
    : path

  return `- ${location} (${authorLogin}): ${body}`
}

export function evaluateReviewThreads(reviewThreads) {
  const blockingThreads = reviewThreads.filter((thread) => !thread.isResolved && !thread.isOutdated)

  if (blockingThreads.length === 0) {
    return { ok: true, message: 'ok' }
  }

  const summary = blockingThreads.map(summarizeBlockingThread).join('\n')

  return {
    ok: false,
    message: `Unresolved review threads must be resolved before merge:\n${summary}`,
  }
}

async function fetchReviewThreads() {
  const token = requireEnv('GITHUB_TOKEN')
  const repository = requireEnv('GITHUB_REPOSITORY')
  const pullRequestNumber = Number.parseInt(requireEnv('GITHUB_PR_NUMBER'), 10)

  if (!Number.isInteger(pullRequestNumber) || pullRequestNumber <= 0) {
    throw new Error('GITHUB_PR_NUMBER must be a positive integer.')
  }

  const [owner, name] = repository.split('/')
  if (!owner || !name) {
    throw new Error('GITHUB_REPOSITORY must be in owner/name format.')
  }

  const query = `
    query ReviewThreads($owner: String!, $name: String!, $number: Int!, $after: String) {
      repository(owner: $owner, name: $name) {
        pullRequest(number: $number) {
          reviewThreads(first: 100, after: $after) {
            pageInfo {
              hasNextPage
              endCursor
            }
            nodes {
              isResolved
              isOutdated
              path
              line
              comments(first: 1) {
                nodes {
                  body
                  author {
                    login
                  }
                }
              }
            }
          }
        }
      }
    }
  `

  const threads = []
  let after = null

  while (true) {
    const response = await fetch('https://api.github.com/graphql', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        query,
        variables: {
          owner,
          name,
          number: pullRequestNumber,
          after,
        },
      }),
    })

    if (!response.ok) {
      throw new Error(`GitHub GraphQL request failed: ${response.status} ${response.statusText}`)
    }

    const payload = await response.json()
    if (Array.isArray(payload.errors) && payload.errors.length > 0) {
      throw new Error(`GitHub GraphQL request failed: ${payload.errors.map((error) => error.message).join('; ')}`)
    }

    const reviewThreads = payload.data?.repository?.pullRequest?.reviewThreads
    if (!reviewThreads) {
      throw new Error(`Pull request #${pullRequestNumber} was not found in ${repository}.`)
    }

    threads.push(...reviewThreads.nodes.map((thread) => ({
      ...thread,
      comments: thread.comments.nodes,
    })))

    if (!reviewThreads.pageInfo.hasNextPage) {
      return threads
    }

    after = reviewThreads.pageInfo.endCursor
  }
}

export async function assertReviewThreadsFromEnv() {
  const reviewThreads = await fetchReviewThreads()
  const result = evaluateReviewThreads(reviewThreads)

  if (!result.ok) {
    throw new Error(result.message)
  }

  return result
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const result = await assertReviewThreadsFromEnv()
  process.stdout.write(`${result.message}\n`)
}
