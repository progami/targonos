import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

export const BLOCK_START = 41000;
export const BLOCK_END = 64900;
export const BLOCK_STEP = 100;
export const SSO_OFFSET = 0;
export const KAIROS_ML_OFFSET = 50;

export const APP_PORTS = [
  { id: 'sso', envKey: 'PORT_SSO', offset: SSO_OFFSET, includeInMap: false },
  { id: 'talos', envKey: 'PORT_TALOS', offset: 1, includeInMap: true },
  { id: 'website', envKey: 'PORT_WEBSITE', offset: 5, includeInMap: true },
  { id: 'atlas', envKey: 'PORT_ATLAS', offset: 6, includeInMap: true },
  { id: 'xplan', envKey: 'PORT_XPLAN', offset: 8, includeInMap: true },
  { id: 'kairos', envKey: 'PORT_KAIROS', offset: 10, includeInMap: true },
  { id: 'plutus', envKey: 'PORT_PLUTUS', offset: 12, includeInMap: true },
  { id: 'hermes', envKey: 'PORT_HERMES', offset: 14, includeInMap: true },
  { id: 'argus', envKey: 'PORT_ARGUS', offset: 16, includeInMap: true },
];

function fail(message) {
  throw new Error(message);
}

function runCommand(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
  });

  if (result.status !== 0) {
    fail(result.stderr.trim() || `${command} exited with code ${result.status}`);
  }

  return result.stdout;
}

export function parsePortsEnv(text) {
  const values = {};

  for (const line of text.split('\n')) {
    const trimmed = line.trim();
    if (trimmed === '') {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');
    if (separatorIndex === -1) {
      fail(`Invalid ports env line: ${trimmed}`);
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = trimmed.slice(separatorIndex + 1).trim();
    values[key] = value;
  }

  return values;
}

export function renderPortsEnv(values) {
  const lines = [];

  for (const [key, value] of Object.entries(values)) {
    lines.push(`${key}=${value}`);
  }

  lines.push('');
  return lines.join('\n');
}

export function parseWorktreeList(text) {
  const worktreeRoots = [];

  for (const block of text.trim().split('\n\n')) {
    if (block.trim() === '') {
      continue;
    }

    const firstLine = block.split('\n')[0];
    if (!firstLine.startsWith('worktree ')) {
      fail(`Invalid worktree block: ${firstLine}`);
    }

    worktreeRoots.push(firstLine.slice('worktree '.length).trim());
  }

  return worktreeRoots;
}

export function buildAssignments(block, worktreeRoot) {
  const portalOrigin = `http://localhost:${block + SSO_OFFSET}`;
  const portsEnv = {
    WORKTREE_PORT_BLOCK: String(block),
    SHARED_PORTAL_ORIGIN: portalOrigin,
  };

  const appMap = {
    host: 'http://localhost',
    apps: {},
  };

  for (const app of APP_PORTS) {
    const port = block + app.offset;
    portsEnv[app.envKey] = String(port);

    if (app.includeInMap) {
      appMap.apps[app.id] = port;
    }
  }

  const kairosMlPort = block + KAIROS_ML_OFFSET;
  portsEnv.PORT_KAIROS_ML = String(kairosMlPort);
  portsEnv.WORKTREE_APP_MAP_PATH = path.join(worktreeRoot, '.codex/generated/dev.worktree.apps.json');

  return {
    portsEnv,
    appMap,
  };
}

export function readAssignedBlock(worktreeRoot) {
  const envPath = path.join(worktreeRoot, '.codex/generated/ports.env');
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const values = parsePortsEnv(fs.readFileSync(envPath, 'utf8'));
  const rawBlock = values.WORKTREE_PORT_BLOCK;
  if (rawBlock === undefined) {
    fail(`Missing WORKTREE_PORT_BLOCK in ${envPath}`);
  }

  const block = Number(rawBlock);
  if (!Number.isInteger(block)) {
    fail(`Invalid WORKTREE_PORT_BLOCK in ${envPath}: ${rawBlock}`);
  }

  return block;
}

export function collectReservedBlocks(worktreeRoots, currentRoot) {
  const reservedBlocks = new Set();
  const normalizedCurrentRoot = path.resolve(currentRoot);

  for (const worktreeRoot of worktreeRoots) {
    const normalizedWorktreeRoot = path.resolve(worktreeRoot);
    if (normalizedWorktreeRoot === normalizedCurrentRoot) {
      continue;
    }

    const block = readAssignedBlock(normalizedWorktreeRoot);
    if (block !== null) {
      reservedBlocks.add(block);
    }
  }

  return reservedBlocks;
}

export function parseListeningPorts(text) {
  const ports = new Set();
  const lines = text.split('\n');

  for (const line of lines) {
    const match = line.match(/:(\d+)\s+\(LISTEN\)$/);
    if (match) {
      ports.add(Number(match[1]));
    }
  }

  return ports;
}

function listListeningPorts() {
  return parseListeningPorts(runCommand('lsof', ['-nP', '-iTCP', '-sTCP:LISTEN']));
}

export function blockConflictsWithPorts(block, listeningPorts) {
  for (const app of APP_PORTS) {
    if (listeningPorts.has(block + app.offset)) {
      return true;
    }
  }

  if (listeningPorts.has(block + KAIROS_ML_OFFSET)) {
    return true;
  }

  return false;
}

export function choosePortBlock({ existingBlock, reservedBlocks, listeningPorts }) {
  if (existingBlock !== null) {
    return existingBlock;
  }

  for (let block = BLOCK_START; block <= BLOCK_END; block += BLOCK_STEP) {
    if (reservedBlocks.has(block)) {
      continue;
    }

    if (blockConflictsWithPorts(block, listeningPorts)) {
      continue;
    }

    return block;
  }

  fail('Unable to find an available worktree port block.');
}

export function assignWorktreePorts({ sourceRoot, worktreeRoot, listeningPorts = null }) {
  const generatedDir = path.join(worktreeRoot, '.codex/generated');
  fs.mkdirSync(generatedDir, { recursive: true });

  const existingBlock = readAssignedBlock(worktreeRoot);
  const worktreeList = parseWorktreeList(
    runCommand('git', ['-C', sourceRoot, 'worktree', 'list', '--porcelain']),
  );
  const reservedBlocks = collectReservedBlocks(worktreeList, worktreeRoot);
  const occupiedPorts = listeningPorts === null ? listListeningPorts() : listeningPorts;
  const block = choosePortBlock({
    existingBlock,
    reservedBlocks,
    listeningPorts: occupiedPorts,
  });

  const { portsEnv, appMap } = buildAssignments(block, worktreeRoot);
  const envPath = path.join(generatedDir, 'ports.env');
  const appMapPath = path.join(generatedDir, 'dev.worktree.apps.json');

  fs.writeFileSync(envPath, renderPortsEnv(portsEnv));
  fs.writeFileSync(appMapPath, `${JSON.stringify(appMap, null, 2)}\n`);

  return {
    block,
    envPath,
    appMapPath,
  };
}

function main() {
  const [command, sourceRoot, worktreeRoot] = process.argv.slice(2);

  if (command !== 'assign') {
    fail('Usage: node ./.codex/scripts/worktree-ports.mjs assign <source-root> <worktree-root>');
  }

  if (sourceRoot === undefined || worktreeRoot === undefined) {
    fail('Usage: node ./.codex/scripts/worktree-ports.mjs assign <source-root> <worktree-root>');
  }

  const result = assignWorktreePorts({
    sourceRoot: path.resolve(sourceRoot),
    worktreeRoot: path.resolve(worktreeRoot),
  });

  process.stdout.write(`Assigned worktree port block ${result.block}\n`);
  process.stdout.write(`Ports env: ${result.envPath}\n`);
  process.stdout.write(`App map: ${result.appMapPath}\n`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
