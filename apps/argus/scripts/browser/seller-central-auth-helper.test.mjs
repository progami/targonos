import assert from 'node:assert/strict'
import test from 'node:test'

import {
  collectChatMessageText,
  extractAmazonEmailVerificationCode,
  findLatestAmazonEmailVerificationCode,
} from './seller-central-auth-helper.mjs'

test('collectChatMessageText includes nested card text', () => {
  const text = collectChatMessageText({
    text: '',
    argumentText: 'Top level',
    cardsV2: [
      {
        card: {
          sections: [
            {
              widgets: [
                {
                  textParagraph: {
                    text: 'Nested 624909',
                  },
                },
              ],
            },
          ],
        },
      },
    ],
  })

  assert.match(text, /Top level/)
  assert.match(text, /Nested 624909/)
})

test('extractAmazonEmailVerificationCode returns the Amazon account access code', () => {
  assert.equal(
    extractAmazonEmailVerificationCode(`
From: amazon.com <account-update@amazon.com>
amazon.com: Account data access attempt
Muhammad Shoaib Gondal, Someone is attempting to access your account data.
If this was you, your verification code is:
624909
Don't share it with others.
`),
    '624909',
  )
})

test('extractAmazonEmailVerificationCode ignores unrelated six-digit numbers', () => {
  assert.equal(
    extractAmazonEmailVerificationCode(`
Reminder: meeting room 123456 is booked.
There is no Amazon verification content in this message.
`),
    '',
  )
})

test('findLatestAmazonEmailVerificationCode picks the newest matching message', () => {
  const code = findLatestAmazonEmailVerificationCode([
    {
      createTime: '2026-04-06T19:10:00Z',
      text: 'amazon.com: Account data access attempt. Your verification code is: 111111',
    },
    {
      createTime: '2026-04-06T19:19:30Z',
      argumentText: 'amazon.com: Account data access attempt. Your verification code is: 624909',
    },
    {
      createTime: '2026-04-06T19:20:00Z',
      text: 'Project update 777777 with no Amazon mention',
    },
  ])

  assert.equal(code, '624909')
})
