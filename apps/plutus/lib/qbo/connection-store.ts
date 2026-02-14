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

function resolveConfiguredConnectionPath(): string | null {
  const configuredPath = process.env.PLUTUS_QBO_CONNECTION_PATH;
  if (configuredPath === undefined) return null;

  const trimmed = configuredPath.trim();
  if (trimmed === '') return null;
  return trimmed;
}

function getDefaultConnectionPath(): string {
  const envSuffix = process.env.QBO_SANDBOX === 'true' ? 'sandbox' : 'production';
  return path.join(os.homedir(), '.targonos', 'plutus', `qbo_connection.main.${envSuffix}.json`);
}

function getLegacyConnectionPath(): string {
  const envSuffix = process.env.QBO_SANDBOX === 'true' ? 'sandbox' : 'production';
  return path.join(os.homedir(), '.targonos', 'plutus', `qbo_connection.${envSuffix}.json`);
}

function resolveConnectionPath(): string {
  const configuredPath = resolveConfiguredConnectionPath();
  if (configuredPath !== null) return configuredPath;
  return getDefaultConnectionPath();
}

function resolveLegacyConnectionPath(): string | null {
  const configuredPath = resolveConfiguredConnectionPath();
  if (configuredPath !== null) return null;
  return getLegacyConnectionPath();
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
    if (nodeError.code === 'ENOENT') {
      const legacyPath = resolveLegacyConnectionPath();
      if (legacyPath === null) return null;

      try {
        const legacyRaw = await fs.readFile(legacyPath, 'utf8');
        const parsedConnection = QboConnectionSchema.parse(JSON.parse(legacyRaw));
        await saveServerQboConnection(parsedConnection);
        return parsedConnection;
      } catch (legacyError) {
        const legacyNodeError = legacyError as NodeJS.ErrnoException;
        if (legacyNodeError.code === 'ENOENT') return null;
        throw legacyError;
      }
    }
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
  const paths = new Set<string>();
  const primaryPath = resolveConnectionPath();
  paths.add(primaryPath);

  const legacyPath = resolveLegacyConnectionPath();
  if (legacyPath !== null) {
    paths.add(legacyPath);
  }

  for (const filePath of paths) {
    try {
      await fs.unlink(filePath);
    } catch (error) {
      const nodeError = error as NodeJS.ErrnoException;
      if (nodeError.code === 'ENOENT') continue;
      throw error;
    }
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
