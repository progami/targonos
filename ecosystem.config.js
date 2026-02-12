const path = require('path');
const DEV_DIR = process.env.TARGONOS_DEV_DIR ?? process.env.TARGON_DEV_DIR;
const MAIN_DIR = process.env.TARGONOS_MAIN_DIR ?? process.env.TARGON_MAIN_DIR;

if (!DEV_DIR) {
  throw new Error('Missing TARGONOS_DEV_DIR (or legacy TARGON_DEV_DIR).');
}

if (!MAIN_DIR) {
  throw new Error('Missing TARGONOS_MAIN_DIR (or legacy TARGON_MAIN_DIR).');
}

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
      env: { NODE_ENV: 'production', PORT: 3100 },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'dev-talos',
      cwd: path.join(DEV_DIR, 'apps/talos'),
      script: 'server.js',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3101 },
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
      env: { NODE_ENV: 'production', PORT: 3105 },
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
      env: { NODE_ENV: 'production', PORT: 3106 },
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
      env: { NODE_ENV: 'production', PORT: 3108 },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },

    {
      name: 'dev-kairos',
      cwd: path.join(DEV_DIR, 'apps/kairos'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3110',
      interpreter: 'node',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3110, KAIROS_ML_URL: 'http://127.0.0.1:3111' },
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
      env: { NODE_ENV: 'production', PORT: 3112 },
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
      env: {
        NODE_ENV: 'production',
        PLUTUS_CASHFLOW_REFRESH_WORKER_ENABLED: '0'
      },
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
      env: { NODE_ENV: 'production', PORT: 3114, BASE_PATH: '/hermes', NEXT_PUBLIC_BASE_PATH: '/hermes' },
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
      env: { NODE_ENV: 'production', HERMES_ORDERS_SYNC_INTERVAL_MINUTES: 60 },
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
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-argus',
      cwd: path.join(DEV_DIR, 'apps/argus'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3116',
      interpreter: 'node',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3116,
        BASE_PATH: '/argus',
        NEXT_PUBLIC_BASE_PATH: '/argus',
        ARGUS_ENV: 'dev'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-argus-scheduler',
      cwd: path.join(DEV_DIR, 'apps/argus'),
      script: 'node_modules/.bin/tsx',
      args: 'lib/jobs/scheduler.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', ARGUS_ENV: 'dev' },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'dev-argus-capture',
      cwd: path.join(DEV_DIR, 'apps/argus'),
      script: 'node_modules/.bin/tsx',
      args: 'lib/jobs/capture-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', ARGUS_ENV: 'dev' },
      autorestart: true,
      watch: false,
      max_memory_restart: '800M'
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
      env: { NODE_ENV: 'production', PORT: 3000 },
      autorestart: true,
      watch: false,
      max_memory_restart: '500M'
    },
    {
      name: 'main-talos',
      cwd: path.join(MAIN_DIR, 'apps/talos'),
      script: 'server.js',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3001 },
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
      env: { NODE_ENV: 'production', PORT: 3005 },
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
      env: { NODE_ENV: 'production', PORT: 3006 },
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
      env: { NODE_ENV: 'production', PORT: 3008 },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },

    {
      name: 'main-kairos',
      cwd: path.join(MAIN_DIR, 'apps/kairos'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3010',
      interpreter: 'node',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', PORT: 3010, KAIROS_ML_URL: 'http://127.0.0.1:3011' },
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
      env: { NODE_ENV: 'production', PORT: 3012 },
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
      env: {
        NODE_ENV: 'production',
        PLUTUS_CASHFLOW_REFRESH_WORKER_ENABLED: '1'
      },
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
      env: { NODE_ENV: 'production', PORT: 3014, BASE_PATH: '/hermes', NEXT_PUBLIC_BASE_PATH: '/hermes' },
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
      env: { NODE_ENV: 'production', HERMES_ORDERS_SYNC_INTERVAL_MINUTES: 60 },
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
      env: { NODE_ENV: 'production' },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-argus',
      cwd: path.join(MAIN_DIR, 'apps/argus'),
      script: 'node_modules/next/dist/bin/next',
      args: 'start -p 3016',
      interpreter: 'node',
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3016,
        BASE_PATH: '/argus',
        NEXT_PUBLIC_BASE_PATH: '/argus',
        ARGUS_ENV: 'main'
      },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-argus-scheduler',
      cwd: path.join(MAIN_DIR, 'apps/argus'),
      script: 'node_modules/.bin/tsx',
      args: 'lib/jobs/scheduler.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', ARGUS_ENV: 'main' },
      autorestart: true,
      watch: false,
      max_memory_restart: '300M'
    },
    {
      name: 'main-argus-capture',
      cwd: path.join(MAIN_DIR, 'apps/argus'),
      script: 'node_modules/.bin/tsx',
      args: 'lib/jobs/capture-worker.ts',
      interpreter: 'none',
      exec_mode: 'fork',
      env: { NODE_ENV: 'production', ARGUS_ENV: 'main' },
      autorestart: true,
      watch: false,
      max_memory_restart: '800M'
    }
  ]
};
