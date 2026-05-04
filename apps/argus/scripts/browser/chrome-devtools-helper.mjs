#!/usr/bin/env node

import { execFileSync } from 'node:child_process'
import { setTimeout as delay } from 'node:timers/promises'
import process from 'node:process'
import { defaultChromeBrowserUrl, defaultChromeStartScriptPath } from './browser-automation-config.mjs'

const BROWSER_URL = defaultChromeBrowserUrl(process.env)
const START_SCRIPT = defaultChromeStartScriptPath(process.env)
const WAIT_TIMEOUT_MS = 60_000

export function parseHosts(hostListText) {
  return String(hostListText ?? '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
}

export function urlMatchesHost(sourceUrl, hostText) {
  if (!sourceUrl || !hostText) {
    return false
  }

  try {
    const parsed = new URL(sourceUrl)
    return parsed.hostname === hostText
  } catch {
    return false
  }
}

export function findMatchingPageTarget(targets, hosts) {
  return (
    targets.find((target) => {
      if (target?.type !== 'page') {
        return false
      }

      return hosts.some((host) => urlMatchesHost(target?.url, host))
    }) ?? null
  )
}

class CdpConnection {
  #nextId = 1
  #pending = new Map()

  constructor(socket) {
    this.socket = socket
    this.socket.addEventListener('message', (event) => {
      const message = JSON.parse(String(event.data))
      if (!message.id) {
        return
      }

      const pending = this.#pending.get(message.id)
      if (!pending) {
        return
      }

      this.#pending.delete(message.id)
      if (message.error) {
        pending.reject(new Error(message.error.message))
        return
      }

      pending.resolve(message.result ?? {})
    })

    this.socket.addEventListener('close', () => {
      for (const pending of this.#pending.values()) {
        pending.reject(new Error('Chrome DevTools connection closed'))
      }
      this.#pending.clear()
    })
  }

  static async connect(webSocketUrl) {
    const socket = new WebSocket(webSocketUrl)
    await new Promise((resolve, reject) => {
      const cleanup = () => {
        socket.removeEventListener('open', onOpen)
        socket.removeEventListener('error', onError)
      }

      const onOpen = () => {
        cleanup()
        resolve()
      }

      const onError = (event) => {
        cleanup()
        reject(event.error ?? new Error('Failed to connect to Chrome DevTools'))
      }

      socket.addEventListener('open', onOpen)
      socket.addEventListener('error', onError)
    })

    return new CdpConnection(socket)
  }

  send(method, params = {}) {
    const id = this.#nextId
    this.#nextId += 1

    return new Promise((resolve, reject) => {
      this.#pending.set(id, { resolve, reject })
      this.socket.send(JSON.stringify({ id, method, params }))
    })
  }

  async close() {
    if (this.socket.readyState === WebSocket.CLOSED) {
      return
    }

    await new Promise((resolve) => {
      this.socket.addEventListener('close', () => resolve(), { once: true })
      this.socket.close()
    })
  }
}

async function fetchJson(pathname) {
  const response = await fetch(`${BROWSER_URL}${pathname}`)
  if (!response.ok) {
    throw new Error(`Chrome DevTools HTTP ${response.status} for ${pathname}`)
  }
  return response.json()
}

async function getBrowserVersion() {
  return fetchJson('/json/version')
}

async function ensureBrowserReady() {
  try {
    await getBrowserVersion()
    return
  } catch {
    execFileSync(START_SCRIPT, { stdio: 'inherit' })
    await getBrowserVersion()
  }
}

async function listPageTargets() {
  const targets = await fetchJson('/json/list')
  return targets.filter((target) => target?.type === 'page')
}

async function waitForTarget(targetId) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS

  while (Date.now() <= deadline) {
    const target = (await listPageTargets()).find((entry) => entry.id === targetId)
    if (target?.webSocketDebuggerUrl) {
      return target
    }
    await delay(200)
  }

  throw new Error(`Timed out waiting for target ${targetId}`)
}

async function connectBrowser() {
  const version = await getBrowserVersion()
  return CdpConnection.connect(version.webSocketDebuggerUrl)
}

async function connectTarget(targetId) {
  const target = await waitForTarget(targetId)
  return CdpConnection.connect(target.webSocketDebuggerUrl)
}

async function activateTarget(targetId) {
  const browser = await connectBrowser()
  try {
    await browser.send('Target.activateTarget', { targetId })
  } finally {
    await browser.close()
  }
}

async function createTarget(url) {
  const browser = await connectBrowser()
  try {
    const { targetId } = await browser.send('Target.createTarget', { url })
    return targetId
  } finally {
    await browser.close()
  }
}

function formatRuntimeResult(result) {
  if (!result) {
    return ''
  }

  if (Object.prototype.hasOwnProperty.call(result, 'value')) {
    const value = result.value
    if (value === null || value === undefined) {
      return ''
    }
    if (typeof value === 'string') {
      return value
    }
    if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
      return String(value)
    }
    return JSON.stringify(value)
  }

  return result.description ?? ''
}

function buildEvaluationError(response) {
  const text = response?.exceptionDetails?.text ?? 'Chrome evaluation failed'
  const description = response?.result?.description
  return new Error(description ? `${text}: ${description}` : text)
}

async function evaluateInTarget(targetId, expression) {
  const target = await connectTarget(targetId)
  try {
    await target.send('Runtime.enable')
    const response = await target.send('Runtime.evaluate', {
      expression,
      awaitPromise: true,
      returnByValue: true,
      userGesture: true,
    })

    if (response.exceptionDetails) {
      throw buildEvaluationError(response)
    }

    return formatRuntimeResult(response.result)
  } finally {
    await target.close()
  }
}

async function navigateTarget(targetId, url) {
  const target = await connectTarget(targetId)
  try {
    await target.send('Page.enable')
    await target.send('Page.navigate', { url })
  } finally {
    await target.close()
  }
}

async function waitForDocument(targetId) {
  const deadline = Date.now() + WAIT_TIMEOUT_MS

  while (Date.now() <= deadline) {
    try {
      const readyState = await evaluateInTarget(targetId, 'document.readyState')
      if (readyState === 'complete' || readyState === 'interactive') {
        return readyState
      }
    } catch {
      // Ignore transient navigation errors while the page is changing.
    }
    await delay(250)
  }

  return 'timeout'
}

async function getTargetUrl(targetId) {
  const target = await waitForTarget(targetId)
  return target.url ?? ''
}

async function ensureTabId(targetUrl, hostListText) {
  const hosts = parseHosts(hostListText)
  const targets = await listPageTargets()
  const match = findMatchingPageTarget(targets, hosts)
  if (match) {
    await activateTarget(match.id)
    return match.id
  }

  return createTarget(targetUrl)
}

async function main() {
  const [actionName, ...rest] = process.argv.slice(2)
  if (!actionName) {
    throw new Error('Missing action.')
  }

  await ensureBrowserReady()

  switch (actionName) {
    case 'ensure-browser':
      return
    case 'ensure-tab-id': {
      if (rest.length < 2) {
        throw new Error('ensure-tab-id requires target URL and host list.')
      }
      process.stdout.write(await ensureTabId(rest[0], rest[1]))
      return
    }
    case 'open-window-tab': {
      if (rest.length < 1) {
        throw new Error('open-window-tab requires target URL.')
      }
      process.stdout.write(await createTarget(rest[0]))
      return
    }
    case 'navigate-tab-id': {
      if (rest.length < 2) {
        throw new Error('navigate-tab-id requires target id and target URL.')
      }
      await activateTarget(rest[0])
      await navigateTarget(rest[0], rest[1])
      return
    }
    case 'wait-tab-id': {
      if (rest.length < 1) {
        throw new Error('wait-tab-id requires target id.')
      }
      process.stdout.write(await waitForDocument(rest[0]))
      return
    }
    case 'run-js-tab-id': {
      if (rest.length < 2) {
        throw new Error('run-js-tab-id requires target id and JS code.')
      }
      await activateTarget(rest[0])
      process.stdout.write(await evaluateInTarget(rest[0], rest[1]))
      return
    }
    case 'get-url-tab-id': {
      if (rest.length < 1) {
        throw new Error('get-url-tab-id requires target id.')
      }
      process.stdout.write(await getTargetUrl(rest[0]))
      return
    }
    default:
      throw new Error(`Unknown action: ${actionName}`)
  }
}

const isDirectRun = process.argv[1] && new URL(`file://${process.argv[1]}`).href === import.meta.url

if (isDirectRun) {
  main().catch((error) => {
    console.error(error?.stack ?? error?.message ?? String(error))
    process.exit(1)
  })
}
