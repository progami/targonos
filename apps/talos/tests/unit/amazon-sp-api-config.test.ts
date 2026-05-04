import assert from 'node:assert/strict'
import test from 'node:test'

import {
  getAmazonSpApiConfigFromEnv,
  isAmazonSpApiConfigurationError,
} from '../../src/lib/amazon/config'

function readFrom(values: Record<string, string | undefined>) {
  return (name: string) => values[name]
}

test('Amazon SP-API config uses UK tenant app credentials for the UK tenant', () => {
  const config = getAmazonSpApiConfigFromEnv('UK', {
    nodeEnv: 'development',
    readEnv: readFrom({
      AMAZON_SP_APP_CLIENT_ID_UK: 'uk-client-id',
      AMAZON_SP_APP_CLIENT_SECRET_UK: 'uk-client-secret',
      AMAZON_REFRESH_TOKEN_UK: 'uk-refresh-token',
      AMAZON_MARKETPLACE_ID_UK: 'A1F83G8C2ARO7P',
      AMAZON_SP_API_REGION_UK: 'eu',
      AMAZON_SELLER_ID_UK: 'uk-seller',
      AMAZON_SP_APP_CLIENT_ID_US: 'us-client-id',
      AMAZON_SP_APP_CLIENT_SECRET_US: 'us-client-secret',
      AMAZON_REFRESH_TOKEN_US: 'us-refresh-token',
      AMAZON_MARKETPLACE_ID_US: 'ATVPDKIKX0DER',
      AMAZON_SP_API_REGION_US: 'na',
      AMAZON_SELLER_ID_US: 'us-seller',
    }),
  })

  assert.deepEqual(config, {
    region: 'eu',
    refreshToken: 'uk-refresh-token',
    marketplaceId: 'A1F83G8C2ARO7P',
    appClientId: 'uk-client-id',
    appClientSecret: 'uk-client-secret',
    sellerId: 'uk-seller',
  })
})

test('Amazon SP-API config uses US tenant app credentials for the US tenant', () => {
  const config = getAmazonSpApiConfigFromEnv('US', {
    nodeEnv: 'development',
    readEnv: readFrom({
      AMAZON_SP_APP_CLIENT_ID_US: 'us-client-id',
      AMAZON_SP_APP_CLIENT_SECRET_US: 'us-client-secret',
      AMAZON_REFRESH_TOKEN_US: 'us-refresh-token',
      AMAZON_MARKETPLACE_ID_US: 'ATVPDKIKX0DER',
      AMAZON_SP_API_REGION_US: 'na',
      AMAZON_SELLER_ID_US: 'us-seller',
      AMAZON_SP_APP_CLIENT_ID_UK: 'uk-client-id',
      AMAZON_SP_APP_CLIENT_SECRET_UK: 'uk-client-secret',
      AMAZON_REFRESH_TOKEN_UK: 'uk-refresh-token',
      AMAZON_MARKETPLACE_ID_UK: 'A1F83G8C2ARO7P',
      AMAZON_SP_API_REGION_UK: 'eu',
      AMAZON_SELLER_ID_UK: 'uk-seller',
    }),
  })

  assert.deepEqual(config, {
    region: 'na',
    refreshToken: 'us-refresh-token',
    marketplaceId: 'ATVPDKIKX0DER',
    appClientId: 'us-client-id',
    appClientSecret: 'us-client-secret',
    sellerId: 'us-seller',
  })
})

test('Amazon SP-API config does not fall back to global app credentials for tenant calls', () => {
  assert.throws(
    () =>
      getAmazonSpApiConfigFromEnv('UK', {
        nodeEnv: 'development',
        readEnv: readFrom({
          AMAZON_SP_APP_CLIENT_ID: 'global-client-id',
          AMAZON_SP_APP_CLIENT_SECRET: 'global-client-secret',
          AMAZON_REFRESH_TOKEN_UK: 'uk-refresh-token',
          AMAZON_MARKETPLACE_ID_UK: 'A1F83G8C2ARO7P',
          AMAZON_SP_API_REGION_UK: 'eu',
        }),
      }),
    /AMAZON_SP_APP_CLIENT_ID_UK, AMAZON_SP_APP_CLIENT_SECRET_UK/
  )
})

test('Amazon SP-API config keeps local mock mode when only marketplace placeholders are set', () => {
  const config = getAmazonSpApiConfigFromEnv('UK', {
    nodeEnv: 'development',
    readEnv: readFrom({
      AMAZON_MARKETPLACE_ID_UK: 'A1F83G8C2ARO7P',
      AMAZON_SP_API_REGION_UK: 'eu',
    }),
  })

  assert.equal(config, null)
})

test('Amazon SP-API config errors are identifiable for API responses', () => {
  assert.equal(
    isAmazonSpApiConfigurationError(
      new Error('Amazon SP-API not configured. Missing env vars: AMAZON_REFRESH_TOKEN_UK')
    ),
    true
  )
  assert.equal(isAmazonSpApiConfigurationError(new Error('Different error')), false)
})
