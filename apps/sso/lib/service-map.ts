// Static topology of the TargonOS stack, shown on the portal's system map.
// Every link names something the workspace's code actually uses; lib/service-map.test.ts
// checks the links against each app's source so the map cannot drift silently.

export type ServiceLineId = 'session' | 'postgres' | 'sp-api' | 's3' | 'google' | 'redis' | 'jobs'

export type ServiceLine = {
  id: ServiceLineId
  name: string
  description: string
}

export type ServiceStation = {
  id: string
  name: string
  mount: string
  links: Partial<Record<ServiceLineId, string>>
}

export type SeparateHost = {
  id: string
  name: string
  host: string
  url: string
  description: string
}

export type ServiceProbe = {
  id: string
  state: 'up' | 'down'
  httpStatus: number | null
  latencyMs: number
}

export type ServiceStatusPayload = {
  checkedAt: string
  services: ServiceProbe[]
}

export const SERVICE_LINES: ServiceLine[] = [
  {
    id: 'session',
    name: 'Portal session',
    description: 'One sign-in on the portal. Every workspace verifies the shared session cookie and reads entitlements from the portal.',
  },
  {
    id: 'postgres',
    name: 'Postgres',
    description: 'Shared portal_db cluster. Each workspace owns its own schema.',
  },
  {
    id: 'sp-api',
    name: 'Amazon SP-API',
    description: 'Amazon Selling Partner API.',
  },
  {
    id: 's3',
    name: 'AWS S3',
    description: 'Document and media storage.',
  },
  {
    id: 'google',
    name: 'Google',
    description: 'Google sign-in and Google APIs.',
  },
  {
    id: 'redis',
    name: 'Redis',
    description: 'Shared cache on the host.',
  },
  {
    id: 'jobs',
    name: 'Background jobs',
    description: 'Processes that run beside the web app.',
  },
]

export const SERVICE_STATIONS: ServiceStation[] = [
  {
    id: 'sso',
    name: 'Portal',
    mount: '/',
    links: {
      session: 'Issues the session after Google sign-in',
      postgres: 'auth schema: users and app entitlements',
      google: 'Google OAuth sign-in',
    },
  },
  {
    id: 'talos',
    name: 'Talos',
    mount: '/talos',
    links: {
      session: 'Verifies the portal session',
      postgres: 'US and UK tenant schemas',
      'sp-api': 'Catalog, FBA inventory, inbound shipments, fees, reports',
      s3: 'Transaction attachments, order documents, exports',
      redis: 'CSRF tokens and rate limits',
    },
  },
  {
    id: 'atlas',
    name: 'Atlas',
    mount: '/atlas',
    links: {
      session: 'Verifies the portal session',
      postgres: 'HR schema',
      s3: 'Employee files',
      google: 'HR calendar sync with Google Calendar',
    },
  },
  {
    id: 'kairos',
    name: 'Kairos',
    mount: '/kairos',
    links: {
      session: 'Verifies the portal session',
      postgres: 'Forecast schema',
      google: 'Google Trends import',
      jobs: 'kairos-ml: Python forecasting service',
    },
  },
  {
    id: 'hermes',
    name: 'Hermes',
    mount: '/hermes',
    links: {
      session: 'Verifies the portal session',
      postgres: 'Orders, campaigns and dispatch log',
      'sp-api': 'Orders, Solicitations and Messaging APIs',
      jobs: 'Hourly orders sync and request-review dispatcher',
    },
  },
  {
    id: 'argus',
    name: 'Argus',
    mount: '/argus',
    links: {
      session: 'Verifies the portal session',
      postgres: 'Listings, monitoring and WPR data',
      'sp-api': 'Catalog items and competitive pricing',
      s3: 'Listing media',
      google: 'Alert emails through Gmail',
      jobs: 'Monitoring runner on the host',
    },
  },
]

export const SEPARATE_HOSTS: SeparateHost[] = [
  {
    id: 'website',
    name: 'Website',
    host: 'www.targonglobal.com',
    url: 'https://www.targonglobal.com',
    description: 'Public site. Own repo, no portal sign-in.',
  },
  {
    id: 'plutus',
    name: 'Plutus',
    host: 'plutus.targonglobal.com',
    url: 'https://plutus.targonglobal.com',
    description: 'Settlement controller. Own repo and runtime.',
  },
  {
    id: 'main-os',
    name: 'Production',
    host: 'os.targonglobal.com',
    url: 'https://os.targonglobal.com',
    description: 'This stack deployed from main.',
  },
  {
    id: 'dev-os',
    name: 'Dev environment',
    host: 'dev-os.targonglobal.com',
    url: 'https://dev-os.targonglobal.com',
    description: 'Same stack deployed from dev, with its own session cookie.',
  },
]

export function stationsOnLine(lineId: ServiceLineId): ServiceStation[] {
  return SERVICE_STATIONS.filter((station) => station.links[lineId] !== undefined)
}
