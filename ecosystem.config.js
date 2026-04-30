const path = require('path');
const { createBitwardenResolver, loadEnvForApp } = require('./scripts/lib/shared-env.cjs');
const DEV_DIR = process.env.TARGONOS_DEV_DIR ?? process.env.TARGON_DEV_DIR;
const MAIN_DIR = process.env.TARGONOS_MAIN_DIR ?? process.env.TARGON_MAIN_DIR;
const HOME_DIR = process.env.HOME;
const sharedEnvBitwardenResolver = createBitwardenResolver(process.env);

function loadAppEnv(rootDir, appName, environment) {
  const result = loadEnvForApp({
    repoRoot: rootDir,
    appName,
    mode: environment === 'production' ? 'production' : 'dev',
    targetEnv: {},
    resolveBitwardenRef: sharedEnvBitwardenResolver,
  });
  return Object.fromEntries(result.entries);
}

function pickProcessEnv(keys) {
  const env = {};
  for (const key of keys) {
    const value = process.env[key];
    if (value !== undefined && value !== '') {
      env[key] = value;
    }
  }
  return env;
}

function createNextAppEnv(rootDir, appName, environment, runtimeEnv) {
  return {
    ...loadAppEnv(rootDir, appName, environment),
    ...runtimeEnv,
  };
}

function getPortalHostedUrl(environment) {
  if (environment === 'dev') {
    return 'https://dev-os.targonglobal.com';
  }

  if (environment === 'production') {
    return 'https://os.targonglobal.com';
  }

  throw new Error(`Unsupported environment for hosted portal URL: ${environment}`);
}

function getHostedCookieDomain(environment) {
  if (environment === 'dev') {
    return '.dev-os.targonglobal.com';
  }

  if (environment === 'production') {
    return '.os.targonglobal.com';
  }

  throw new Error(`Unsupported environment for hosted cookie domain: ${environment}`);
}

function getHostedBuildMetadataEnv() {
  return pickProcessEnv([
    'NEXT_PUBLIC_VERSION',
    'NEXT_PUBLIC_RELEASE_URL',
    'NEXT_PUBLIC_COMMIT_SHA',
    'BUILD_TIME',
    'NEXT_PUBLIC_BUILD_TIME',
  ]);
}

function getHostedSharedSecret(env) {
  const sharedSecret = env.PORTAL_AUTH_SECRET ?? env.NEXTAUTH_SECRET;
  if (!sharedSecret) {
    throw new Error('Hosted portal auth secret is required.');
  }
  return sharedSecret;
}

function omitHostedManagedAppEnv(appEnv) {
  const managedKeys = [
    'BASE_URL',
    'BUILD_TIME',
    'COOKIE_DOMAIN',
    'NEXTAUTH_SECRET',
    'NEXTAUTH_URL',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_BUILD_TIME',
    'NEXT_PUBLIC_COMMIT_SHA',
    'NEXT_PUBLIC_PORTAL_APPS_BASE_URL',
    'NEXT_PUBLIC_PORTAL_AUTH_URL',
    'NEXT_PUBLIC_RELEASE_URL',
    'NEXT_PUBLIC_VERSION',
    'PORTAL_APPS_BASE_URL',
    'PORTAL_AUTH_SECRET',
    'PORTAL_AUTH_URL',
  ];
  const sanitized = { ...appEnv };
  for (const key of managedKeys) {
    delete sanitized[key];
  }
  return sanitized;
}

function createPortalRuntimeEnv(rootDir, environment, runtimeEnv) {
  const portalBaseUrl = getPortalHostedUrl(environment);
  const portalEnv = loadAppEnv(rootDir, 'sso', environment);
  const portalProcessEnv = pickProcessEnv(['PORTAL_AUTH_SECRET', 'NEXTAUTH_SECRET', 'PORTAL_DB_URL']);
  const sharedSecret = getHostedSharedSecret({
    ...portalEnv,
    ...portalProcessEnv,
  });
  const buildMetadataEnv = getHostedBuildMetadataEnv();
  let portalDatabaseUrl = portalEnv.PORTAL_DB_URL;
  if (portalProcessEnv.PORTAL_DB_URL !== undefined) {
    portalDatabaseUrl = portalProcessEnv.PORTAL_DB_URL;
  }
  if (!portalDatabaseUrl) {
    throw new Error(`Missing PORTAL_DB_URL for hosted portal ${environment} runtime.`);
  }

  return {
    ...portalEnv,
    ...runtimeEnv,
    ...buildMetadataEnv,
    PORTAL_AUTH_SECRET: sharedSecret,
    NEXTAUTH_SECRET: sharedSecret,
    PORTAL_DB_URL: portalDatabaseUrl,
    COOKIE_DOMAIN: getHostedCookieDomain(environment),
    PORTAL_APPS_BASE_URL: portalBaseUrl,
    NEXT_PUBLIC_PORTAL_APPS_BASE_URL: portalBaseUrl,
    PORTAL_AUTH_URL: portalBaseUrl,
    NEXT_PUBLIC_PORTAL_AUTH_URL: portalBaseUrl,
    NEXTAUTH_URL: portalBaseUrl,
    NEXT_PUBLIC_APP_URL: portalBaseUrl,
    BASE_URL: portalBaseUrl,
  };
}

function normalizeHostedBasePath(rawValue) {
  if (rawValue === undefined || rawValue === null) {
    return '';
  }

  const trimmed = String(rawValue).trim();
  if (trimmed === '' || trimmed === '/') {
    return '';
  }

  const withoutTrailingSlash = trimmed.replace(/\/+$/g, '');
  if (withoutTrailingSlash.startsWith('/')) {
    return withoutTrailingSlash;
  }

  return `/${withoutTrailingSlash}`;
}

function buildHostedAppUrl(portalBaseUrl, basePath) {
  const portalUrl = new URL(portalBaseUrl);
  const normalizedBasePath = normalizeHostedBasePath(basePath);
  portalUrl.pathname = normalizedBasePath === '' ? '/' : normalizedBasePath;
  portalUrl.search = '';
  portalUrl.hash = '';

  if (portalUrl.pathname === '/') {
    return portalUrl.origin;
  }

  return `${portalUrl.origin}${portalUrl.pathname}`;
}

function resolveHostedBasePath(appEnv, runtimeEnv) {
  if (runtimeEnv.NEXT_PUBLIC_BASE_PATH !== undefined && runtimeEnv.NEXT_PUBLIC_BASE_PATH !== '') {
    return runtimeEnv.NEXT_PUBLIC_BASE_PATH;
  }

  if (runtimeEnv.BASE_PATH !== undefined && runtimeEnv.BASE_PATH !== '') {
    return runtimeEnv.BASE_PATH;
  }

  if (appEnv.NEXT_PUBLIC_BASE_PATH !== undefined && appEnv.NEXT_PUBLIC_BASE_PATH !== '') {
    return appEnv.NEXT_PUBLIC_BASE_PATH;
  }

  if (appEnv.BASE_PATH !== undefined && appEnv.BASE_PATH !== '') {
    return appEnv.BASE_PATH;
  }

  return '/';
}

function createNextAppEnvWithPortal(rootDir, appName, environment, runtimeEnv) {
  const portalEnv = createPortalRuntimeEnv(rootDir, environment, {});
  const appEnv = omitHostedManagedAppEnv(
    loadAppEnv(rootDir, appName, environment),
  );
  const portalBaseUrl = portalEnv.PORTAL_AUTH_URL;
  if (!portalBaseUrl) {
    throw new Error(`Missing PORTAL_AUTH_URL for ${appName} ${environment} runtime.`);
  }
  if (!portalEnv.PORTAL_DB_URL) {
    throw new Error(`Missing PORTAL_DB_URL for ${appName} ${environment} runtime.`);
  }

  const basePath = resolveHostedBasePath(appEnv, runtimeEnv);
  const appUrl = buildHostedAppUrl(portalBaseUrl, basePath);
  const buildMetadataEnv = getHostedBuildMetadataEnv();
  const sharedSecret = getHostedSharedSecret(portalEnv);

  return {
    ...appEnv,
    ...runtimeEnv,
    ...buildMetadataEnv,
    PORTAL_AUTH_SECRET: sharedSecret,
    NEXTAUTH_SECRET: sharedSecret,
    PORTAL_DB_URL: portalEnv.PORTAL_DB_URL,
    COOKIE_DOMAIN: portalEnv.COOKIE_DOMAIN,
    PORTAL_APPS_BASE_URL: portalBaseUrl,
    NEXT_PUBLIC_PORTAL_APPS_BASE_URL: portalBaseUrl,
    PORTAL_AUTH_URL: portalBaseUrl,
    NEXT_PUBLIC_PORTAL_AUTH_URL: portalBaseUrl,
    NEXTAUTH_URL: appUrl,
    NEXT_PUBLIC_APP_URL: appUrl,
    BASE_URL: appUrl,
  };
}

function createHermesWorkerEnv(rootDir, environment, runtimeEnv) {
  return {
    ...loadAppEnv(rootDir, 'hermes', environment),
    ...runtimeEnv,
  };
}

const XPLAN_SELLERBOARD_ENV_KEYS = [
  'SELLERBOARD_SYNC_TOKEN',
  'SELLERBOARD_US_ORDERS_REPORT_URL',
  'SELLERBOARD_US_DASHBOARD_REPORT_URL',
  'SELLERBOARD_UK_ORDERS_REPORT_URL',
  'SELLERBOARD_UK_DASHBOARD_REPORT_URL',
  'XPLAN_SELLERBOARD_SYNC_INTERVAL_MINUTES',
];

function createXplanRuntimeEnv(rootDir, environment, runtimeEnv) {
  return {
    ...createNextAppEnvWithPortal(rootDir, 'xplan', environment, runtimeEnv),
    ...pickProcessEnv(XPLAN_SELLERBOARD_ENV_KEYS),
  };
}

if (!DEV_DIR) {
  throw new Error('Missing TARGONOS_DEV_DIR (or legacy TARGON_DEV_DIR).');
}

if (!MAIN_DIR) {
  throw new Error('Missing TARGONOS_MAIN_DIR (or legacy TARGON_MAIN_DIR).');
}

if (!HOME_DIR) {
  throw new Error('Missing HOME environment variable.');
}

const PLUTUS_STATE_DIR = path.join(HOME_DIR, '.targonos', 'plutus');
const DEV_PLUTUS_QBO_CONNECTION_PATH = path.join(PLUTUS_STATE_DIR, 'qbo_connection.dev.production.json');
const MAIN_PLUTUS_QBO_CONNECTION_PATH = path.join(PLUTUS_STATE_DIR, 'qbo_connection.main.production.json');

module.exports = {
  apps: [
    // ===========================================
    // DEV ENVIRONMENT (31xx ports) - dev-os.targonglobal.com
    // ===========================================
    {
      name: 'dev-targonos',
      cwd: path.join(DEV_DIR, 'apps/sso'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3100',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createPortalRuntimeEnv(DEV_DIR, 'dev', { NODE_ENV: 'production', PORT: 3100 }),
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'dev-talos',
      cwd: path.join(DEV_DIR, 'apps/talos'),
      script: 'server.js',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'talos', 'dev', {
        NODE_ENV: 'production',
        PORT: 3101,
        BASE_PATH: '/talos',
        NEXT_PUBLIC_BASE_PATH: '/talos',
        SKIP_DOTENV: '1',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'dev-website',
      cwd: path.join(DEV_DIR, 'apps/website'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3105',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnv(DEV_DIR, 'website', 'dev', { NODE_ENV: 'production', PORT: 3105 }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-atlas',
      cwd: path.join(DEV_DIR, 'apps/atlas'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3106',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'atlas', 'dev', {
        NODE_ENV: 'production',
        PORT: 3106,
        BASE_PATH: '/atlas',
        NEXT_PUBLIC_BASE_PATH: '/atlas',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-xplan',
      cwd: path.join(DEV_DIR, 'apps/xplan'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3108',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createXplanRuntimeEnv(DEV_DIR, 'dev', {
        NODE_ENV: 'production',
        PORT: 3108,
        BASE_PATH: '/xplan',
        NEXT_PUBLIC_BASE_PATH: '/xplan',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-xplan-sellerboard-sync',
      cwd: path.join(DEV_DIR, 'apps/xplan'),
      script: 'node_modules/.bin/tsx',
      args: 'scripts/sellerboard-sync-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createXplanRuntimeEnv(DEV_DIR, 'dev', {
        NODE_ENV: 'production',
        XPLAN_SELLERBOARD_SYNC_INTERVAL_MINUTES: '60',
        BASE_PATH: '/xplan',
        NEXT_PUBLIC_BASE_PATH: '/xplan',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    },

    {
      name: 'dev-kairos',
      cwd: path.join(DEV_DIR, 'apps/kairos'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3110',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'kairos', 'dev', {
        NODE_ENV: 'production',
        PORT: 3110,
        KAIROS_ML_URL: 'http://127.0.0.1:3111',
        BASE_PATH: '/kairos',
        NEXT_PUBLIC_BASE_PATH: '/kairos',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-kairos-ml',
      cwd: path.join(DEV_DIR, 'services/kairos-ml'),
      script: '.venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 3111',
      interpreter: 'none',
      exec_mode: 'fork',
      env: { PYTHONUNBUFFERED: '1', PORT: 3111 },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-plutus',
      cwd: path.join(DEV_DIR, 'apps/plutus'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3112',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'plutus', 'dev', {
        NODE_ENV: 'production',
        PORT: 3112,
        PLUTUS_QBO_CONNECTION_PATH: DEV_PLUTUS_QBO_CONNECTION_PATH,
        BASE_PATH: '/plutus',
        NEXT_PUBLIC_BASE_PATH: '/plutus',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-plutus-cashflow-refresh',
      cwd: path.join(DEV_DIR, 'apps/plutus'),
      script: 'node_modules/.bin/tsx',
      args: 'scripts/cashflow-refresh-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'plutus', 'dev', {
        NODE_ENV: 'production',
        PLUTUS_CASHFLOW_REFRESH_WORKER_ENABLED: '0',
        PLUTUS_QBO_CONNECTION_PATH: DEV_PLUTUS_QBO_CONNECTION_PATH,
        BASE_PATH: '/plutus',
        NEXT_PUBLIC_BASE_PATH: '/plutus',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-plutus-settlement-sync',
      cwd: path.join(DEV_DIR, 'apps/plutus'),
      script: 'node_modules/.bin/tsx',
      args: 'scripts/settlement-sync-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'plutus', 'dev', {
        NODE_ENV: 'production',
        PLUTUS_SETTLEMENT_SYNC_WORKER_ENABLED: '0',
        PLUTUS_SETTLEMENT_SYNC_INTERVAL_MINUTES: '60',
        PLUTUS_SETTLEMENT_SYNC_LOOKBACK_DAYS: '45',
        PLUTUS_QBO_CONNECTION_PATH: DEV_PLUTUS_QBO_CONNECTION_PATH,
        BASE_PATH: '/plutus',
        NEXT_PUBLIC_BASE_PATH: '/plutus',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-hermes',
      cwd: path.join(DEV_DIR, 'apps/hermes'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3114',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'hermes', 'dev', {
        NODE_ENV: 'production',
        PORT: 3114,
        BASE_PATH: '/hermes',
        NEXT_PUBLIC_BASE_PATH: '/hermes',
        HERMES_AUTO_MIGRATE: '0',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-hermes-orders-sync',
      cwd: path.join(DEV_DIR, 'apps/hermes'),
      script: 'node_modules/.bin/tsx',
      args: 'src/server/jobs/orders-sync-hourly.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createHermesWorkerEnv(DEV_DIR, 'dev', {
        NODE_ENV: 'production',
        HERMES_ORDERS_SYNC_INTERVAL_MINUTES: 60,
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-hermes-request-review',
      cwd: path.join(DEV_DIR, 'apps/hermes'),
      script: 'node_modules/.bin/tsx',
      args: 'src/server/jobs/request-review-dispatcher.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createHermesWorkerEnv(DEV_DIR, 'dev', {
        NODE_ENV: 'production',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-argus',
      cwd: path.join(DEV_DIR, 'apps/argus'),
      script: '.next/standalone/apps/argus/server.js',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(DEV_DIR, 'argus', 'dev', {
        NODE_ENV: 'production',
        PORT: 3116,
        BASE_PATH: '/argus',
        NEXT_PUBLIC_BASE_PATH: '/argus'
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },

    // ===========================================
    // MAIN ENVIRONMENT (30xx ports) - os.targonglobal.com
    // ===========================================
    {
      name: 'main-targonos',
      cwd: path.join(MAIN_DIR, 'apps/sso'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3000',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createPortalRuntimeEnv(MAIN_DIR, 'production', { NODE_ENV: 'production', PORT: 3000 }),
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'main-talos',
      cwd: path.join(MAIN_DIR, 'apps/talos'),
      script: 'server.js',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'talos', 'production', {
        NODE_ENV: 'production',
        PORT: 3001,
        BASE_PATH: '/talos',
        NEXT_PUBLIC_BASE_PATH: '/talos',
        SKIP_DOTENV: '1',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'main-website',
      cwd: path.join(MAIN_DIR, 'apps/website'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3005',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnv(MAIN_DIR, 'website', 'production', { NODE_ENV: 'production', PORT: 3005 }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-atlas',
      cwd: path.join(MAIN_DIR, 'apps/atlas'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3006',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'atlas', 'production', {
        NODE_ENV: 'production',
        PORT: 3006,
        BASE_PATH: '/atlas',
        NEXT_PUBLIC_BASE_PATH: '/atlas',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-xplan',
      cwd: path.join(MAIN_DIR, 'apps/xplan'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3008',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createXplanRuntimeEnv(MAIN_DIR, 'production', {
        NODE_ENV: 'production',
        PORT: 3008,
        BASE_PATH: '/xplan',
        NEXT_PUBLIC_BASE_PATH: '/xplan',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-xplan-sellerboard-sync',
      cwd: path.join(MAIN_DIR, 'apps/xplan'),
      script: 'node_modules/.bin/tsx',
      args: 'scripts/sellerboard-sync-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createXplanRuntimeEnv(MAIN_DIR, 'production', {
        NODE_ENV: 'production',
        XPLAN_SELLERBOARD_SYNC_INTERVAL_MINUTES: '60',
        BASE_PATH: '/xplan',
        NEXT_PUBLIC_BASE_PATH: '/xplan',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '200M'
    },

    {
      name: 'main-kairos',
      cwd: path.join(MAIN_DIR, 'apps/kairos'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3010',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'kairos', 'production', {
        NODE_ENV: 'production',
        PORT: 3010,
        KAIROS_ML_URL: 'http://127.0.0.1:3011',
        BASE_PATH: '/kairos',
        NEXT_PUBLIC_BASE_PATH: '/kairos',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-kairos-ml',
      cwd: path.join(MAIN_DIR, 'services/kairos-ml'),
      script: '.venv/bin/python',
      args: '-m uvicorn app.main:app --host 127.0.0.1 --port 3011',
      interpreter: 'none',
      exec_mode: 'fork',
      env: { PYTHONUNBUFFERED: '1', PORT: 3011 },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-plutus',
      cwd: path.join(MAIN_DIR, 'apps/plutus'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3012',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'plutus', 'production', {
        NODE_ENV: 'production',
        PORT: 3012,
        PLUTUS_QBO_CONNECTION_PATH: MAIN_PLUTUS_QBO_CONNECTION_PATH,
        BASE_PATH: '/plutus',
        NEXT_PUBLIC_BASE_PATH: '/plutus',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-plutus-cashflow-refresh',
      cwd: path.join(MAIN_DIR, 'apps/plutus'),
      script: 'node_modules/.bin/tsx',
      args: 'scripts/cashflow-refresh-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'plutus', 'production', {
        NODE_ENV: 'production',
        PLUTUS_CASHFLOW_REFRESH_WORKER_ENABLED: '1',
        PLUTUS_QBO_CONNECTION_PATH: MAIN_PLUTUS_QBO_CONNECTION_PATH,
        BASE_PATH: '/plutus',
        NEXT_PUBLIC_BASE_PATH: '/plutus',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-plutus-settlement-sync',
      cwd: path.join(MAIN_DIR, 'apps/plutus'),
      script: 'node_modules/.bin/tsx',
      args: 'scripts/settlement-sync-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'plutus', 'production', {
        NODE_ENV: 'production',
        PLUTUS_SETTLEMENT_SYNC_WORKER_ENABLED: '1',
        PLUTUS_SETTLEMENT_SYNC_INTERVAL_MINUTES: '60',
        PLUTUS_SETTLEMENT_SYNC_LOOKBACK_DAYS: '45',
        PLUTUS_QBO_CONNECTION_PATH: MAIN_PLUTUS_QBO_CONNECTION_PATH,
        BASE_PATH: '/plutus',
        NEXT_PUBLIC_BASE_PATH: '/plutus',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-hermes',
      cwd: path.join(MAIN_DIR, 'apps/hermes'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3014',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'hermes', 'production', {
        NODE_ENV: 'production',
        PORT: 3014,
        BASE_PATH: '/hermes',
        NEXT_PUBLIC_BASE_PATH: '/hermes',
        HERMES_AUTO_MIGRATE: '0',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-hermes-orders-sync',
      cwd: path.join(MAIN_DIR, 'apps/hermes'),
      script: 'node_modules/.bin/tsx',
      args: 'src/server/jobs/orders-sync-hourly.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createHermesWorkerEnv(MAIN_DIR, 'production', {
        NODE_ENV: 'production',
        HERMES_ORDERS_SYNC_INTERVAL_MINUTES: 60,
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-hermes-request-review',
      cwd: path.join(MAIN_DIR, 'apps/hermes'),
      script: 'node_modules/.bin/tsx',
      args: 'src/server/jobs/request-review-dispatcher.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: createHermesWorkerEnv(MAIN_DIR, 'production', {
        NODE_ENV: 'production',
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-argus',
      cwd: path.join(MAIN_DIR, 'apps/argus'),
      script: '.next/standalone/apps/argus/server.js',
      interpreter: 'node',
      exec_mode: 'fork',
      env: createNextAppEnvWithPortal(MAIN_DIR, 'argus', 'production', {
        NODE_ENV: 'production',
        PORT: 3016,
        BASE_PATH: '/argus',
        NEXT_PUBLIC_BASE_PATH: '/argus'
      }),
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
  ]
};
module.exports.createPortalRuntimeEnv = createPortalRuntimeEnv;
module.exports.createNextAppEnvWithPortal = createNextAppEnvWithPortal;
module.exports.createHermesWorkerEnv = createHermesWorkerEnv;
module.exports.buildHostedAppUrl = buildHostedAppUrl;
module.exports.getHostedCookieDomain = getHostedCookieDomain;
