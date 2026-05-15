import {
  getServerQboConnectionPath,
  loadServerQboConnection,
  saveServerQboConnection,
} from '@/lib/qbo/connection-store';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const AMAZON_DUPLICATE_ACCOUNTS = [
  'Amazon Sales',
  'Amazon Refunds',
  'Amazon Reimbursement',
  'Amazon Reimbursements',
  'Amazon Shipping',
  'Amazon Advertising',
  'Amazon FBA Fees',
  'Amazon Seller Fees',
  'Amazon Storage Fees',
  'Amazon FBA Inventory Reimbursement',
  'Amazon Carried Balances',
  'Amazon Pending Balances',
  'Amazon Deferred Balances',
  'Amazon Reserved Balances',
  'Amazon Split Month Rollovers',
  'Amazon Loans',
  'Amazon Sales Tax',
  'Amazon Sales Tax Collected',
] as const;

type QboConnection = {
  realmId: string;
  accessToken: string;
  refreshToken: string;
  expiresAt: string;
};

function printUsage(): void {
  console.log('Usage: pnpm qbo <command>');
  console.log('');
  console.log('Commands:');
  console.log('  connection:show');
  console.log('  accounts:deactivate <name...>');
  console.log('  accounts:deactivate-amazon-duplicates');
  console.log('  accounts:rename-lmb-to-plutus [--dry-run]');
  console.log('  accounts:migrate-warehousing-prefix');
  console.log('');
}

function parseDotenvLine(rawLine: string): { key: string; value: string } | null {
  let line = rawLine.trim();
  if (line === '') return null;
  if (line.startsWith('#')) return null;

  if (line.startsWith('export ')) {
    line = line.slice('export '.length).trim();
  }

  const equalsIndex = line.indexOf('=');
  if (equalsIndex === -1) return null;

  const key = line.slice(0, equalsIndex).trim();
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(key)) return null;

  let value = line.slice(equalsIndex + 1).trim();

  const hasSingleQuotes = value.startsWith("'") && value.endsWith("'");
  const hasDoubleQuotes = value.startsWith('"') && value.endsWith('"');
  if (hasSingleQuotes) {
    value = value.slice(1, -1);
  }

  if (hasDoubleQuotes) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

async function loadEnvFile(filePath: string): Promise<void> {
  let raw: string;
  try {
    raw = await fs.readFile(filePath, 'utf8');
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code === 'ENOENT') return;
    throw error;
  }

  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (!parsed) continue;

    if (process.env[parsed.key] === undefined) {
      process.env[parsed.key] = parsed.value;
    }
  }
}

async function loadPlutusEnv(): Promise<void> {
  const cwd = process.cwd();
  await loadEnvFile(path.join(cwd, '.env.local'));
  await loadEnvFile(path.join(cwd, '.env'));
}

async function requireServerConnection(): Promise<QboConnection> {
  const connection = await loadServerQboConnection();
  if (!connection) {
    throw new Error(
      `No server-stored QBO connection found at ${getServerQboConnectionPath()}. Connect to QBO in Plutus first.`
    );
  }

  const { getValidToken } = await import('@/lib/qbo/api');
  const { updatedConnection } = await getValidToken(connection);
  if (updatedConnection) {
    await saveServerQboConnection(updatedConnection);
    return updatedConnection;
  }

  return connection;
}

async function showConnection(): Promise<void> {
  const connection = await requireServerConnection();
  console.log(
    JSON.stringify(
      { connectionPath: getServerQboConnectionPath(), realmId: connection.realmId, expiresAt: connection.expiresAt },
      null,
      2,
    ),
  );
}

async function deactivateAmazonDuplicateAccounts(): Promise<void> {
  await deactivateAccountsByName([...AMAZON_DUPLICATE_ACCOUNTS], { dryRun: false });
}

async function deactivateAccountsByName(
  accountNames: string[],
  options: { dryRun: boolean },
): Promise<void> {
  let connection = await requireServerConnection();

  const { fetchAccounts, updateAccountActive } = await import('@/lib/qbo/api');
  const { accounts, updatedConnection } = await fetchAccounts(connection, {
    includeInactive: true,
  });
  if (updatedConnection) {
    connection = updatedConnection;
    await saveServerQboConnection(updatedConnection);
  }

  const targets = new Set(accountNames.map((name) => name.toLowerCase()));
  const matches = accounts.filter((account) => targets.has(account.Name.toLowerCase()));

  const matchedNames = new Set(matches.map((account) => account.Name.toLowerCase()));
  const missing = accountNames.filter((name) => !matchedNames.has(name.toLowerCase()));

  console.log(JSON.stringify({ totalTargets: accountNames.length, matched: matches.length, missing: missing.length }, null, 2));

  for (const account of matches) {
    if (account.Active === false) {
      console.log(JSON.stringify({ alreadyInactive: account.Name, id: account.Id }, null, 2));
      continue;
    }

    if (options.dryRun) {
      console.log(JSON.stringify({ wouldDeactivate: account.Name, id: account.Id }, null, 2));
      continue;
    }

    const result = await updateAccountActive(connection, account.Id, account.SyncToken, account.Name, false);
    if (result.updatedConnection) {
      connection = result.updatedConnection;
      await saveServerQboConnection(result.updatedConnection);
    }
    console.log(JSON.stringify({ deactivated: account.Name, id: account.Id }, null, 2));
  }

  if (missing.length > 0) {
    console.log(JSON.stringify({ missing }, null, 2));
  }
}

async function migrateWarehousingPrefixAccounts(): Promise<void> {
  let connection = await requireServerConnection();

  const { fetchAccounts, updateAccountActive } = await import('@/lib/qbo/api');
  const { accounts, updatedConnection } = await fetchAccounts(connection, { includeInactive: true });
  if (updatedConnection) {
    connection = updatedConnection;
    await saveServerQboConnection(updatedConnection);
  }

  const buckets: Array<{ parentFullyQualifiedName: string; prefix: string }> = [
    { parentFullyQualifiedName: 'Warehousing:3PL', prefix: '3PL' },
    { parentFullyQualifiedName: 'Warehousing:Amazon FC', prefix: 'Amazon FC' },
    { parentFullyQualifiedName: 'Warehousing:AWD', prefix: 'AWD' },
  ];

  const parents = buckets.map((bucket) => {
    const parent = accounts.find((account) => account.FullyQualifiedName === bucket.parentFullyQualifiedName);
    if (!parent) {
      throw new Error(`Missing warehousing parent account in QBO: ${bucket.parentFullyQualifiedName}`);
    }
    return { ...bucket, parent };
  });

  const results: Array<{ action: 'renamed' | 'skipped'; parent: string; fromName: string; toName: string; id: string }> = [];

  for (const bucket of parents) {
    const children = accounts.filter((account) => account.ParentRef?.value === bucket.parent.Id);

    for (const child of children) {
      if (child.Active !== true && child.Active !== false) {
        throw new Error(`Missing Active flag for QBO account (id=${child.Id} name="${child.Name}").`);
      }

      const expectedPrefix = `${bucket.prefix} - `;
      if (child.Name.startsWith(expectedPrefix)) {
        results.push({ action: 'skipped', parent: bucket.parentFullyQualifiedName, fromName: child.Name, toName: child.Name, id: child.Id });
        continue;
      }

      if (child.Name.includes(' - ')) {
        throw new Error(
          `Unexpected warehousing child account name (parent=${bucket.parentFullyQualifiedName} id=${child.Id} name="${child.Name}").`,
        );
      }

      const nextName = `${bucket.prefix} - ${child.Name}`;
      const existing = children.find((account) => account.Name === nextName);
      if (existing) {
        throw new Error(
          `Cannot migrate warehousing account name; target already exists (parent=${bucket.parentFullyQualifiedName} from="${child.Name}" to="${nextName}").`,
        );
      }

      const { account: updatedAccount, updatedConnection: renamedConnection } = await updateAccountActive(
        connection,
        child.Id,
        child.SyncToken,
        nextName,
        child.Active,
      );
      if (renamedConnection) {
        connection = renamedConnection;
        await saveServerQboConnection(renamedConnection);
      }

      const idx = accounts.findIndex((a) => a.Id === updatedAccount.Id);
      if (idx >= 0) {
        accounts[idx] = updatedAccount;
      } else {
        accounts.push(updatedAccount);
      }

      results.push({
        action: 'renamed',
        parent: bucket.parentFullyQualifiedName,
        fromName: child.Name,
        toName: updatedAccount.Name,
        id: updatedAccount.Id,
      });

      console.log(
        JSON.stringify(
          { renamed: `${bucket.parentFullyQualifiedName}:${child.Name}`, to: `${bucket.parentFullyQualifiedName}:${updatedAccount.Name}` },
          null,
          2,
        ),
      );
    }
  }

  const renamedCount = results.filter((r) => r.action === 'renamed').length;
  const skippedCount = results.length - renamedCount;
  console.log(JSON.stringify({ total: results.length, renamed: renamedCount, skipped: skippedCount }, null, 2));
}

async function renameLmbAccountsToPlutus(input: { dryRun: boolean }): Promise<void> {
  let connection = await requireServerConnection();

  const { fetchAccounts, updateAccountActive } = await import('@/lib/qbo/api');
  const { accounts, updatedConnection } = await fetchAccounts(connection, { includeInactive: true });
  if (updatedConnection) {
    connection = updatedConnection;
    await saveServerQboConnection(updatedConnection);
  }

  const byLowerName = new Map<string, { id: string; name: string }>();
  for (const account of accounts) {
    byLowerName.set(account.Name.toLowerCase(), { id: account.Id, name: account.Name });
  }

  const targets = accounts
    .filter((account) => account.Name.includes('(LMB)'))
    .sort((a, b) => a.Name.localeCompare(b.Name));

  const results: Array<{ action: 'renamed' | 'skipped'; id: string; fromName: string; toName: string }> = [];

  for (const account of targets) {
    if (account.Active !== true && account.Active !== false) {
      throw new Error(`Missing Active flag for QBO account (id=${account.Id} name="${account.Name}").`);
    }

    const baseName = account.Name.replace(/\s*\(LMB\)\s*$/, '').trim();
    if (baseName === '') {
      throw new Error(`Invalid LMB account name (id=${account.Id} name="${account.Name}").`);
    }

    const nextName = `Plutus ${baseName}`;
    const existing = byLowerName.get(nextName.toLowerCase());
    if (existing && existing.id !== account.Id) {
      throw new Error(
        `Cannot rename LMB account; target name already exists (from="${account.Name}" to="${nextName}" existingId=${existing.id}).`,
      );
    }

    if (input.dryRun) {
      results.push({ action: 'skipped', id: account.Id, fromName: account.Name, toName: nextName });
      console.log(JSON.stringify({ wouldRename: account.Name, to: nextName, id: account.Id }, null, 2));
      continue;
    }

    const { account: updatedAccount, updatedConnection: renamedConnection } = await updateAccountActive(
      connection,
      account.Id,
      account.SyncToken,
      nextName,
      account.Active,
    );
    if (renamedConnection) {
      connection = renamedConnection;
      await saveServerQboConnection(renamedConnection);
    }

    const idx = accounts.findIndex((a) => a.Id === updatedAccount.Id);
    if (idx >= 0) {
      accounts[idx] = updatedAccount;
    }

    byLowerName.delete(account.Name.toLowerCase());
    byLowerName.set(updatedAccount.Name.toLowerCase(), { id: updatedAccount.Id, name: updatedAccount.Name });

    results.push({ action: 'renamed', id: updatedAccount.Id, fromName: account.Name, toName: updatedAccount.Name });
    console.log(JSON.stringify({ renamed: account.Name, to: updatedAccount.Name, id: updatedAccount.Id }, null, 2));
  }

  const renamedCount = results.filter((r) => r.action === 'renamed').length;
  const skippedCount = results.length - renamedCount;
  console.log(JSON.stringify({ total: results.length, renamed: renamedCount, skipped: skippedCount }, null, 2));
}

async function main(): Promise<void> {
  await loadPlutusEnv();
  const [command] = process.argv.slice(2);

  if (!command) {
    printUsage();
    process.exitCode = 1;
    return;
  }

  if (command === 'connection:show') {
    await showConnection();
    return;
  }

  if (command === 'accounts:deactivate') {
    const accountNames = process.argv.slice(3);
    if (accountNames.length === 0) {
      printUsage();
      process.exitCode = 1;
      return;
    }

    await deactivateAccountsByName(accountNames, { dryRun: false });
    return;
  }

  if (command === 'accounts:deactivate-amazon-duplicates') {
    await deactivateAmazonDuplicateAccounts();
    return;
  }

  if (command === 'accounts:rename-lmb-to-plutus') {
    const args = process.argv.slice(3);
    const dryRun = args.includes('--dry-run');
    await renameLmbAccountsToPlutus({ dryRun });
    return;
  }

  if (command === 'accounts:migrate-warehousing-prefix') {
    await migrateWarehousingPrefixAccounts();
    return;
  }

  printUsage();
  process.exitCode = 1;
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
