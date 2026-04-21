import test from 'node:test';
import assert from 'node:assert/strict';

import {
  parsePostmasterPid,
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
