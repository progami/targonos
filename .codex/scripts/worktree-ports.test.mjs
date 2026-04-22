import test from 'node:test';
import assert from 'node:assert/strict';

import {
  BLOCK_START,
  BLOCK_STEP,
  APP_PORTS,
  SSO_OFFSET,
  KAIROS_ML_OFFSET,
  buildAssignments,
  choosePortBlock,
  parsePortsEnv,
  parseWorktreeList,
  renderPortsEnv,
} from './worktree-ports.mjs';

test('parseWorktreeList returns each worktree path', () => {
  const worktreeList = [
    'worktree /repo/main',
    'HEAD abc123',
    'branch refs/heads/dev',
    '',
    'worktree /repo/.worktrees/talos/feature-a',
    'HEAD def456',
    'detached',
    '',
  ].join('\n');

  assert.deepEqual(parseWorktreeList(worktreeList), [
    '/repo/main',
    '/repo/.worktrees/talos/feature-a',
  ]);
});

test('renderPortsEnv round-trips through parsePortsEnv', () => {
  const { portsEnv } = buildAssignments(41200, '/repo/.worktrees/talos/feature-a');
  assert.deepEqual(parsePortsEnv(renderPortsEnv(portsEnv)), portsEnv);
});

test('buildAssignments uses the expected offsets', () => {
  const { portsEnv, appMap } = buildAssignments(41200, '/repo/.worktrees/atlas/feature-b');

  assert.equal(portsEnv.WORKTREE_PORT_BLOCK, '41200');
  assert.equal(portsEnv.SHARED_PORTAL_ORIGIN, `http://localhost:${41200 + SSO_OFFSET}`);
  assert.equal(portsEnv.PORT_KAIROS_ML, String(41200 + KAIROS_ML_OFFSET));
  assert.equal(portsEnv.PORT_SSO, String(41200 + SSO_OFFSET));

  for (const app of APP_PORTS) {
    assert.equal(portsEnv[app.envKey], String(41200 + app.offset));
    if (app.includeInMap) {
      assert.equal(appMap.apps[app.id], 41200 + app.offset);
    }
  }

  assert.equal('sso' in appMap.apps, false);
});

test('choosePortBlock skips reserved and occupied blocks', () => {
  const reservedBlocks = new Set([BLOCK_START]);
  const listeningPorts = new Set([BLOCK_START + BLOCK_STEP + 1]);

  const block = choosePortBlock({
    existingBlock: null,
    reservedBlocks,
    listeningPorts,
  });

  assert.equal(block, BLOCK_START + (BLOCK_STEP * 2));
});

test('choosePortBlock preserves an existing block assignment', () => {
  const reservedBlocks = new Set([BLOCK_START, BLOCK_START + BLOCK_STEP]);
  const listeningPorts = new Set([BLOCK_START + 1]);

  const block = choosePortBlock({
    existingBlock: BLOCK_START,
    reservedBlocks,
    listeningPorts,
  });

  assert.equal(block, BLOCK_START);
});
