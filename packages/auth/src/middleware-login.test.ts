import assert from 'node:assert/strict'
import test from 'node:test'

import { buildAppLoginRedirect } from './middleware-login'

test('buildAppLoginRedirect preserves current path under atlas base path', () => {
  const redirect = buildAppLoginRedirect({
    portalOrigin: 'https://os.targonglobal.com',
    appOrigin: 'https://os.targonglobal.com',
    appBasePath: '/atlas',
    pathname: '/atlas/tasks',
    search: '?view=open',
  })

  assert.equal(
    redirect.toString(),
    'https://os.targonglobal.com/login?callbackUrl=https%3A%2F%2Fos.targonglobal.com%2Fatlas%2Ftasks%3Fview%3Dopen',
  )
})

test('buildAppLoginRedirect prefixes the app base path when the pathname is root-relative', () => {
  const redirect = buildAppLoginRedirect({
    portalOrigin: 'https://os.targonglobal.com',
    appOrigin: 'https://os.targonglobal.com',
    appBasePath: '/argus',
    pathname: '/brand/demo',
    search: '',
    hash: '#section',
  })

  assert.equal(
    redirect.toString(),
    'https://os.targonglobal.com/login?callbackUrl=https%3A%2F%2Fos.targonglobal.com%2Fargus%2Fbrand%2Fdemo%23section',
  )
})
