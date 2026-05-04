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

test('buildAppLoginRedirect preserves an explicitly passed loopback app origin', () => {
  const redirect = buildAppLoginRedirect({
    portalOrigin: 'https://dev-os.targonglobal.com',
    appOrigin: 'http://localhost:3201',
    appBasePath: '/talos',
    pathname: '/dashboard',
    search: '?tenant=US',
  })

  assert.equal(
    redirect.toString(),
    'https://dev-os.targonglobal.com/login?callbackUrl=http%3A%2F%2Flocalhost%3A3201%2Ftalos%2Fdashboard%3Ftenant%3DUS',
  )
})
