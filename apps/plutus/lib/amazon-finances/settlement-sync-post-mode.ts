export const PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE = 'PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE';

export class ExplicitPostToQboError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ExplicitPostToQboError';
  }
}

export type SettlementSyncQboPostMode = 'read_only' | 'post_qbo';

export function parseSettlementSyncWorkerPostMode(
  rawMode: string | undefined,
): { mode: SettlementSyncQboPostMode; postToQbo: boolean } {
  const mode = rawMode === undefined ? '' : rawMode.trim();

  if (mode === 'read_only') {
    return { mode, postToQbo: false };
  }

  if (mode === 'post_qbo') {
    return { mode, postToQbo: true };
  }

  throw new ExplicitPostToQboError(
    `${PLUTUS_SETTLEMENT_SYNC_QBO_POST_MODE} must be set explicitly to "read_only" or "post_qbo".`,
  );
}

export function parseSettlementSyncCliPostFlag(
  argv: string[],
  commandName: string,
): { postToQbo: boolean; argv: string[] } {
  let postToQbo: boolean | undefined;
  const remainingArgs: string[] = [];

  for (const arg of argv) {
    if (arg !== '--post-qbo' && arg !== '--no-post') {
      remainingArgs.push(arg);
      continue;
    }

    if (postToQbo !== undefined) {
      throw new ExplicitPostToQboError(`Only one QBO posting flag is allowed for ${commandName}.`);
    }

    postToQbo = arg === '--post-qbo';
  }

  if (postToQbo === undefined) {
    throw new ExplicitPostToQboError(`${commandName} requires explicit --post-qbo or --no-post.`);
  }

  return { postToQbo, argv: remainingArgs };
}

export function requireExplicitPostToQbo(body: unknown, source: string): boolean {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    throw new ExplicitPostToQboError(`${source} requires a JSON object with explicit postToQbo.`);
  }

  const value = (body as Record<string, unknown>).postToQbo;
  if (value === true || value === false) {
    return value;
  }

  throw new ExplicitPostToQboError(`${source} requires explicit boolean postToQbo.`);
}
