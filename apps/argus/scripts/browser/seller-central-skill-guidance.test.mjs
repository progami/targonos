import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const skillPaths = [
  '/Users/jarraramjad/.agents/skills/chrome-devtools-mcp/SKILL.md',
  '/Users/jarraramjad/.agents/skills/case-agent/SKILL.md',
  '/Users/jarraramjad/.agents/skills/awd-fee-reports/SKILL.md',
]

for (const skillPath of skillPaths) {
  const body = readFileSync(skillPath, 'utf8')

  test(`skill guidance includes shoaibgondal account in ${skillPath}`, () => {
    assert.match(body, /shoaibgondal@targonglobal\.com/)
  })

  test(`skill guidance includes Bitwarden CLI TOTP in ${skillPath}`, () => {
    assert.match(body, /Bitwarden CLI TOTP|bitwarden.*totp|bw get totp/i)
  })
}
