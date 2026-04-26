import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('./run.sh', import.meta.url), 'utf8')

test('weekly API no-arg Sunday run uses the last fully available API week', () => {
  assert.match(source, /if \[ -z "\$START_DATE" \]/)
  assert.match(source, /if \(day === 0\) \{/)
  assert.match(source, /daysBackToCompletedSaturday \+= 7/)
  assert.match(source, /DATE_FLAGS="--start-date \$START_DATE --end-date \$END_DATE"/)
  assert.match(source, /Weekly API source window: \$START_DATE\.\.\$END_DATE/)
})
