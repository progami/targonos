import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import type { QboConnection } from './api';

function resolveConnectionPath(): string {
  const configuredPath = process.env.PLUTUS_QBO_CONNECTION_PATH;
  if (configuredPath) return configuredPath;

  const envSuffix = process.env.QBO_SANDBOX === 'true' ? 'sandbox' : 'production';
  return path.join(os.homedir(), '.targonos', 'plutus', `qbo_connection.${envSuffix}.json`);
}

export function getServerQboConnectionPath(): string {
  return resolveConnectionPath();
}

async function ensureParentDir(filePath: string): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true, mode: 0o700 });
}

export async function loadServerQboConnection(): Promise<QboConnection | null> {
  const filePath = resolveConnectionPath();

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw) as QboConnection;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return null;
    throw error;
  }
}

export async function saveServerQboConnection(connection: QboConnection): Promise<void> {
  const filePath = resolveConnectionPath();
  await ensureParentDir(filePath);

  const tmpPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(tmpPath, `${JSON.stringify(connection, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.rename(tmpPath, filePath);
}

export async function ensureServerQboConnection(connection: QboConnection): Promise<void> {
  const existing = await loadServerQboConnection();
  if (!existing) {
    await saveServerQboConnection(connection);
  }
}

export async function deleteServerQboConnection(): Promise<void> {
  const filePath = resolveConnectionPath();

  try {
    await fs.unlink(filePath);
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return;
    throw error;
  }
}
