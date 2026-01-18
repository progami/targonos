const path = require('path');
const DEV_DIR =
  process.env.TARGONOS_DEV_DIR || process.env.TARGON_DEV_DIR || '/Users/jarraramjad/targonos-dev';
const MAIN_DIR =
  process.env.TARGONOS_MAIN_DIR || process.env.TARGON_MAIN_DIR || '/Users/jarraramjad/targonos-main';

module.exports = {
  apps: [
    // ===========================================
    // DEV ENVIRONMENT (31xx ports) - dev-targonos.targonglobal.com
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

    // ===========================================
    // MAIN ENVIRONMENT (30xx ports) - targonos.targonglobal.com
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
    }
  ]
};
