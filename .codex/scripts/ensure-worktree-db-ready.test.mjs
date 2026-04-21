import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

import {
  buildPrismaClientPath,
  buildPrismaProbeScript,
  parsePostmasterPid,
  resolveWorktreeRoot,
  shouldRemoveStalePostmasterPid,
} from './ensure-worktree-db-ready.mjs';

test('parsePostmasterPid reads the important fields from postmaster.pid', () => {
  const pid = parsePostmasterPid([
    '877',
    '/opt/homebrew/var/postgresql@14',
    '1776703350',
    '5432',
    '/tmp',
    'localhost',
    '3091113     65536',
    'stopping',
  ].join('\n'));

  assert.deepEqual(pid, {
    pid: 877,
    dataDir: '/opt/homebrew/var/postgresql@14',
    port: 5432,
    socketDir: '/tmp',
    listenAddresses: 'localhost',
    status: 'stopping',
  });
});

test('shouldRemoveStalePostmasterPid returns true when the pid file is marked stopping', () => {
  assert.equal(
    shouldRemoveStalePostmasterPid({
      pidInfo: {
        pid: 877,
        dataDir: '/opt/homebrew/var/postgresql@14',
        port: 5432,
        socketDir: '/tmp',
        listenAddresses: 'localhost',
        status: 'stopping',
      },
      command: '/System/Library/CoreServices/pbs',
    }),
    true,
  );
});

test('shouldRemoveStalePostmasterPid returns true when the pid does not belong to postgres', () => {
  assert.equal(
    shouldRemoveStalePostmasterPid({
      pidInfo: {
        pid: 877,
        dataDir: '/opt/homebrew/var/postgresql@14',
        port: 5432,
        socketDir: '/tmp',
        listenAddresses: 'localhost',
        status: 'ready',
      },
      command: '/System/Library/CoreServices/pbs',
    }),
    true,
  );
});

test('shouldRemoveStalePostmasterPid returns false for a live postgres server', () => {
  assert.equal(
    shouldRemoveStalePostmasterPid({
      pidInfo: {
        pid: 1234,
        dataDir: '/opt/homebrew/var/postgresql@14',
        port: 5432,
        socketDir: '/tmp',
        listenAddresses: 'localhost',
        status: 'ready',
      },
      command: '/opt/homebrew/opt/postgresql@14/bin/postgres -D /opt/homebrew/var/postgresql@14',
    }),
    false,
  );
});

test('shouldRemoveStalePostmasterPid returns true when the process is gone', () => {
  assert.equal(
    shouldRemoveStalePostmasterPid({
      pidInfo: {
        pid: 1234,
        dataDir: '/opt/homebrew/var/postgresql@14',
        port: 5432,
        socketDir: '/tmp',
        listenAddresses: 'localhost',
        status: 'ready',
      },
      command: null,
    }),
    true,
  );
});

test('resolveWorktreeRoot trims CODEX_WORKTREE_PATH', () => {
  const previous = process.env.CODEX_WORKTREE_PATH;

  process.env.CODEX_WORKTREE_PATH = '  /tmp/worktree-root  ';

  try {
    assert.equal(resolveWorktreeRoot(), '/tmp/worktree-root');
  } finally {
    if (previous === undefined) {
      delete process.env.CODEX_WORKTREE_PATH;
    } else {
      process.env.CODEX_WORKTREE_PATH = previous;
    }
  }
});

test('resolveWorktreeRoot fails when CODEX_WORKTREE_PATH is missing', () => {
  const previous = process.env.CODEX_WORKTREE_PATH;
  delete process.env.CODEX_WORKTREE_PATH;

  try {
    assert.throws(
      () => resolveWorktreeRoot(),
      /CODEX_WORKTREE_PATH is required for Prisma readiness checks/,
    );
  } finally {
    if (previous !== undefined) {
      process.env.CODEX_WORKTREE_PATH = previous;
    }
  }
});

test('buildPrismaClientPath points at the worktree auth client', () => {
  assert.equal(
    buildPrismaClientPath('/tmp/worktree-root'),
    path.join(
      '/tmp/worktree-root',
      'packages',
      'auth',
      'node_modules',
      '.prisma',
      'client-auth',
      'index.js',
    ),
  );
});

test('buildPrismaProbeScript wires the client path and db url into the Prisma probe', () => {
  const clientPath = '/tmp/worktree-root/packages/auth/node_modules/.prisma/client-auth/index.js';
  const databaseUrl = 'postgresql://user:pass@localhost:6432/portal_db_dev?pgbouncer=true&schema=auth_dev';

  const script = buildPrismaProbeScript(clientPath, databaseUrl);

  assert.match(script, /const \{ PrismaClient \} = require\("/);
  assert.match(script, /\$queryRawUnsafe\('select 1'\)/);
  assert.match(script, /process\.stdout\.write\('1'\)/);
  assert.match(script, /await prisma\.\$disconnect\(\)\.catch\(\(\) => \{\}\);/);
  assert.match(script, new RegExp(clientPath.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(script, new RegExp(databaseUrl.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
