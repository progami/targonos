import { fileURLToPath } from 'node:url'
import path from 'node:path'

export function findSuccessfulPushRun(workflowRuns, headSha) {
  for (const run of workflowRuns) {
    if (!run || typeof run !== 'object') {
      continue
    }

    if (run.head_sha !== headSha) {
      continue
    }

    if (run.conclusion !== 'success') {
      continue
    }

    return run
  }

  return null
}

export function assertPromotionReady({ branchSha, headSha, workflowRuns }) {
  if (branchSha !== headSha) {
    return {
      ok: false,
      reason: `Promotion PR head ${headSha} does not match the current dev tip ${branchSha}.`,
    }
  }

  const matchingRun = findSuccessfulPushRun(workflowRuns, headSha)
  if (!matchingRun) {
    return {
      ok: false,
      reason: `No successful dev push CI run found for ${headSha}. Merge to dev and wait for CI before promoting to main.`,
    }
  }

  return {
    ok: true,
    matchingRun,
  }
}

function requireEnv(name) {
  const value = process.env[name]
  if (!value || value.trim() === '') {
    throw new Error(`${name} must be set.`)
  }

  return value.trim()
}

async function fetchJson(url, token) {
  const response = await fetch(url, {
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${token}`,
      'X-GitHub-Api-Version': '2022-11-28',
    },
  })

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`GitHub API request failed (${response.status}) for ${url}: ${body}`)
  }

  return response.json()
}

async function listCompletedPushWorkflowRuns({
  apiBaseUrl,
  owner,
  repo,
  workflowId,
  branch,
  token,
}) {
  const workflowRuns = []
  let page = 1

  while (true) {
    const url = new URL(`${apiBaseUrl}/repos/${owner}/${repo}/actions/workflows/${workflowId}/runs`)
    url.searchParams.set('branch', branch)
    url.searchParams.set('event', 'push')
    url.searchParams.set('status', 'completed')
    url.searchParams.set('per_page', '100')
    url.searchParams.set('page', String(page))

    const payload = await fetchJson(url, token)
    const pageRuns = Array.isArray(payload.workflow_runs) ? payload.workflow_runs.filter(Boolean) : []
    workflowRuns.push(...pageRuns)

    if (pageRuns.length < 100) {
      return workflowRuns
    }

    page += 1
  }
}

async function main() {
  const apiBaseUrl = requireEnv('GITHUB_API_URL')
  const repository = requireEnv('GITHUB_REPOSITORY')
  const token = requireEnv('GITHUB_TOKEN')
  const headSha = requireEnv('GITHUB_HEAD_SHA')
  const branch = requireEnv('PROMOTION_BRANCH')
  const workflowId = requireEnv('PROMOTION_WORKFLOW_ID')

  const repositoryParts = repository.split('/')
  if (repositoryParts.length !== 2) {
    throw new Error(`GITHUB_REPOSITORY must be in owner/repo form, received ${repository}.`)
  }

  const [owner, repo] = repositoryParts
  const branchPayload = await fetchJson(
    `${apiBaseUrl}/repos/${owner}/${repo}/branches/${branch}`,
    token,
  )

  const branchSha = branchPayload?.commit?.sha
  if (typeof branchSha !== 'string' || branchSha.trim() === '') {
    throw new Error(`GitHub branch payload for ${branch} is missing commit.sha.`)
  }

  const workflowRuns = await listCompletedPushWorkflowRuns({
    apiBaseUrl,
    owner,
    repo,
    workflowId,
    branch,
    token,
  })

  const result = assertPromotionReady({
    branchSha,
    headSha,
    workflowRuns,
  })

  if (!result.ok) {
    console.error(`::error::${result.reason}`)
    process.exit(1)
  }

  console.log(`Found successful dev push CI run ${result.matchingRun.html_url} for ${headSha}.`)
}

const modulePath = fileURLToPath(import.meta.url)

if (process.argv[1] && path.resolve(process.argv[1]) === modulePath) {
  await main()
}
