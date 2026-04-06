import { execFileSync } from 'node:child_process'

const GWORKSPACE_API_BIN =
  process.env.GWORKSPACE_API_BIN || '/Users/jarraramjad/.local/bin/gworkspace-api'
const CHAT_MESSAGE_SCOPE = 'https://www.googleapis.com/auth/chat.messages.readonly'

export function collectChatMessageText(message) {
  const parts = []

  for (const key of ['text', 'argumentText', 'formattedText']) {
    const value = message?.[key]
    if (typeof value === 'string' && value !== '') {
      parts.push(value)
    }
  }

  collectNestedStrings(message?.cardsV2, parts)
  return parts.join('\n')
}

function collectNestedStrings(value, parts) {
  if (typeof value === 'string' && value !== '') {
    parts.push(value)
    return
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      collectNestedStrings(item, parts)
    }
    return
  }

  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      collectNestedStrings(item, parts)
    }
  }
}

export function extractAmazonEmailVerificationCode(messageText) {
  const text = String(messageText || '')
  if (!/amazon\.com|account data access attempt/i.test(text)) {
    return ''
  }

  const patterns = [
    /your verification code is:\s*(\d{6})/i,
    /verification code is:\s*(\d{6})/i,
    /account data access attempt[\s\S]{0,300}?(\d{6})/i,
    /amazon\.com[\s\S]{0,300}?(\d{6})/i,
  ]

  for (const pattern of patterns) {
    const match = text.match(pattern)
    if (match && match[1]) {
      return match[1]
    }
  }

  return ''
}

export function findLatestAmazonEmailVerificationCode(messages) {
  const candidates = []

  for (const message of messages) {
    const code = extractAmazonEmailVerificationCode(collectChatMessageText(message))
    if (code === '') {
      continue
    }

    const createdAt = Date.parse(String(message?.createTime || ''))
    if (Number.isNaN(createdAt)) {
      continue
    }

    candidates.push({ code, createdAt })
  }

  candidates.sort((left, right) => right.createdAt - left.createdAt)
  return candidates[0]?.code || ''
}

function fetchChatMessagesPage(spaceId, subject, pageToken) {
  const url = new URL(`https://chat.googleapis.com/v1/${spaceId}/messages`)
  url.searchParams.set('pageSize', '100')
  url.searchParams.set('orderBy', 'createTime DESC')
  if (pageToken !== '') {
    url.searchParams.set('pageToken', pageToken)
  }

  const args = ['request', 'GET', url.toString(), '--scope', CHAT_MESSAGE_SCOPE, '--subject', subject]
  const stdout = execFileSync(GWORKSPACE_API_BIN, args, { encoding: 'utf8' })
  return JSON.parse(stdout)
}

function latestChatVerificationCode(spaceId, subject) {
  let pageToken = ''

  for (let pageIndex = 0; pageIndex < 5; pageIndex += 1) {
    const payload = fetchChatMessagesPage(spaceId, subject, pageToken)
    const messages = Array.isArray(payload.messages) ? payload.messages : []
    const code = findLatestAmazonEmailVerificationCode(messages)
    if (code !== '') {
      return code
    }

    const nextPageToken = String(payload.nextPageToken || '')
    if (nextPageToken === '') {
      break
    }
    pageToken = nextPageToken
  }

  throw new Error(`No Amazon verification code found in ${spaceId} for ${subject}`)
}

function main() {
  const command = process.argv[2]

  if (command === 'latest-chat-code') {
    const subject = process.argv[3]
    const spaceId = process.argv[4]
    process.stdout.write(latestChatVerificationCode(spaceId, subject))
    return
  }

  throw new Error(`Unsupported command: ${command}`)
}

if (import.meta.main) {
  main()
}
