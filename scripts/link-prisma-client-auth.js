#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

const repoRoot = path.resolve(__dirname, '..');

function copyDir(name, sourceDir, destDir) {
  if (!sourceDir || !fs.existsSync(sourceDir)) {
    console.warn(`[link-prisma] ${name} source not found, skipping:`, sourceDir);
    return;
  }
  try {
    fs.mkdirSync(path.dirname(destDir), { recursive: true });
    if (fs.existsSync(destDir)) {
      fs.rmSync(destDir, { recursive: true, force: true });
    }
    if (typeof fs.cpSync === 'function') {
      fs.cpSync(sourceDir, destDir, { recursive: true });
    } else {
      const { spawnSync } = require('child_process');
      const result = spawnSync('cp', ['-R', sourceDir + '/.', destDir]);
      if (result.status !== 0) {
        throw new Error(result.stderr.toString());
      }
    }
    console.log(`[link-prisma] Copied ${name} Prisma client to`, destDir);
  } catch (error) {
    console.error(`[link-prisma] Failed to copy ${name} Prisma client:`, error);
    process.exitCode = 1;
  }
}

// 1. Auth client for SSO
const authSource = path.resolve(repoRoot, 'packages/auth/node_modules/.prisma/client-auth');
const authDest = path.resolve(repoRoot, 'apps/sso/node_modules/.prisma/client-auth');
copyDir('auth', authSource, authDest);

// 2. X-Plan client
function findXPlanSource() {
  const candidates = [];
  const pnpmRoot = path.join(repoRoot, 'node_modules/.pnpm');
  if (fs.existsSync(pnpmRoot)) {
    for (const entry of fs.readdirSync(pnpmRoot)) {
      if (entry.startsWith('@prisma+client@')) {
        candidates.push(path.join(pnpmRoot, entry, 'node_modules/.prisma/client'));
      }
    }
  }
  const pnpmApp = path.join(repoRoot, 'apps/xplan/node_modules/.pnpm');
  if (fs.existsSync(pnpmApp)) {
    for (const entry of fs.readdirSync(pnpmApp)) {
      if (entry.startsWith('@prisma+client@')) {
        candidates.push(path.join(pnpmApp, entry, 'node_modules/.prisma/client'));
      }
    }
  }
  candidates.push(path.join(repoRoot, 'apps/xplan/node_modules/.prisma/client'));
  return candidates.find((candidate) => fs.existsSync(candidate));
}

const xplanSource = findXPlanSource();
const xplanDest = path.resolve(repoRoot, 'apps/xplan/node_modules/.prisma/client');
copyDir('xplan', xplanSource, xplanDest);

if (process.exitCode) {
  process.exit(process.exitCode);
}
