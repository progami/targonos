#!/usr/bin/env node

const fs = require('node:fs')
const path = require('node:path')

const repoRoot = path.resolve(__dirname, '..')

const DEPLOYABLE_APPS = [
  { id: 'sso', key: 'sso' },
  { id: 'talos', key: 'talos' },
  { id: 'website', key: 'website' },
  { id: 'xplan', key: 'xplan' },
  { id: 'kairos', key: 'kairos' },
  { id: 'atlas', key: 'atlas' },
  { id: 'plutus', key: 'plutus' },
  { id: 'hermes', key: 'hermes' },
  { id: 'argus', key: 'argus' },
]

const deployableAppKeysById = new Map(DEPLOYABLE_APPS.map((app) => [app.id, app.key]))

const changedFiles = readChangedFilesFromStdin()
const packagesChanged = changedFiles.some((filePath) => filePath.startsWith('packages/'))

const workspaces = discoverWorkspaces(repoRoot)
const workspacesByName = new Map(workspaces.map((workspace) => [workspace.name, workspace]))
const workspacesByRelDir = new Map(workspaces.map((workspace) => [workspace.relDir, workspace]))

const dependentsGraph = buildDependentsGraph(workspaces, workspacesByName)

const changedWorkspaces = new Set()
for (const filePath of changedFiles) {
  const relDir = workspaceRelDirForFile(filePath)
  if (!relDir) {
    continue
  }
  const workspace = workspacesByRelDir.get(relDir)
  if (!workspace) {
    continue
  }
  changedWorkspaces.add(workspace.name)
}

const affectedWorkspaces = collectDependentsClosure(changedWorkspaces, dependentsGraph)

const affectedDeployableApps = new Set()
for (const workspaceName of affectedWorkspaces) {
  const workspace = workspacesByName.get(workspaceName)
  if (!workspace || workspace.kind !== 'app') {
    continue
  }

  const deployKey = deployableAppKeysById.get(workspace.id)
  if (!deployKey) {
    continue
  }
  affectedDeployableApps.add(deployKey)
}

const outputLines = []
for (const deployKey of Array.from(affectedDeployableApps).sort()) {
  outputLines.push(`${deployKey}=true`)
}

if (packagesChanged) {
  outputLines.push('packages=true')
}

if (packagesChanged || affectedDeployableApps.size > 0) {
  outputLines.push('any_app=true')
} else {
  outputLines.push('any_app=false')
}

process.stdout.write(outputLines.join('\n') + '\n')

function readChangedFilesFromStdin() {
  const input = fs.readFileSync(0, 'utf8')
  return input
    .split(/\r?\n/u)
    .map((line) => line.trim())
    .filter(Boolean)
}

function workspaceRelDirForFile(filePath) {
  const normalized = String(filePath).replace(/\\/gu, '/')
  const [topLevel, workspaceId] = normalized.split('/', 3)
  if (!topLevel || !workspaceId) {
    return null
  }

  if (topLevel === 'apps') {
    if (workspaceId === 'archived') {
      return null
    }
    return `apps/${workspaceId}`
  }

  if (topLevel === 'packages') {
    return `packages/${workspaceId}`
  }

  return null
}

function discoverWorkspaces(rootDir) {
  const workspaces = []

  const appsDir = path.join(rootDir, 'apps')
  if (fs.existsSync(appsDir)) {
    for (const entry of fs.readdirSync(appsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }

      const id = entry.name
      if (id === 'archived') {
        continue
      }

      const relDir = `apps/${id}`
      const packageJsonPath = path.join(appsDir, id, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        continue
      }

      const packageJson = safeReadJson(packageJsonPath)
      if (!packageJson || typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
        continue
      }

      workspaces.push({
        kind: 'app',
        id,
        name: packageJson.name,
        relDir,
        deps: extractDependencyNames(packageJson),
      })
    }
  }

  const packagesDir = path.join(rootDir, 'packages')
  if (fs.existsSync(packagesDir)) {
    for (const entry of fs.readdirSync(packagesDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) {
        continue
      }

      const id = entry.name
      const relDir = `packages/${id}`
      const packageJsonPath = path.join(packagesDir, id, 'package.json')
      if (!fs.existsSync(packageJsonPath)) {
        continue
      }

      const packageJson = safeReadJson(packageJsonPath)
      if (!packageJson || typeof packageJson.name !== 'string' || packageJson.name.length === 0) {
        continue
      }

      workspaces.push({
        kind: 'package',
        id,
        name: packageJson.name,
        relDir,
        deps: extractDependencyNames(packageJson),
      })
    }
  }

  return workspaces
}

function extractDependencyNames(packageJson) {
  const buckets = [
    packageJson.dependencies,
    packageJson.devDependencies,
    packageJson.peerDependencies,
    packageJson.optionalDependencies,
  ]

  const names = new Set()
  for (const bucket of buckets) {
    if (!bucket || typeof bucket !== 'object') {
      continue
    }
    for (const depName of Object.keys(bucket)) {
      names.add(depName)
    }
  }

  return Array.from(names)
}

function buildDependentsGraph(workspaces, workspacesByName) {
  const dependents = new Map()

  for (const workspace of workspaces) {
    for (const depName of workspace.deps) {
      if (!workspacesByName.has(depName)) {
        continue
      }

      let dependentSet = dependents.get(depName)
      if (!dependentSet) {
        dependentSet = new Set()
        dependents.set(depName, dependentSet)
      }
      dependentSet.add(workspace.name)
    }
  }

  return dependents
}

function collectDependentsClosure(seeds, dependentsGraph) {
  const visited = new Set(seeds)
  const queue = Array.from(seeds)

  while (queue.length > 0) {
    const current = queue.shift()
    const dependents = dependentsGraph.get(current)
    if (!dependents) {
      continue
    }

    for (const dependent of dependents) {
      if (visited.has(dependent)) {
        continue
      }
      visited.add(dependent)
      queue.push(dependent)
    }
  }

  return visited
}

function safeReadJson(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'))
  } catch (error) {
    console.error(`[detect-cd-affected-apps] Failed to read ${filePath}: ${error.message}`)
    return null
  }
}
