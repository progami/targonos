import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { z } from 'zod';
import type { QboConnection } from './api';

// ---------------------------------------------------------------------------
// Zod schemas
// ---------------------------------------------------------------------------

/** Schema for the full server-side QBO connection (stored in the JSON file). */
export const QboConnectionSchema = z.object({
  realmId: z.string().min(1),
  accessToken: z.string().min(1),
  refreshToken: z.string().min(1),
  expiresAt: z.string().min(1),
});

// ---------------------------------------------------------------------------
// File-path helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Server-side connection CRUD
// ---------------------------------------------------------------------------

export async function loadServerQboConnection(): Promise<QboConnection | null> {
  const filePath = resolveConnectionPath();

  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return QboConnectionSchema.parse(JSON.parse(raw));
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

// ---------------------------------------------------------------------------
// getQboConnection() — the single entry point for all API routes
// ---------------------------------------------------------------------------

/**
 * Load the QBO connection from the server-side JSON file.
 * Returns `null` when no connection exists (user hasn't connected yet).
 *
 * Access control is handled by Portal auth / middleware — the connection
 * is shared across all Plutus users so no per-browser cookie gate is needed.
 */
export async function getQboConnection(): Promise<QboConnection | null> {
  return loadServerQboConnection();
}
