import { db } from '@/lib/db';
import { fetchAccounts } from '@/lib/qbo/api';
import { getQboConnection, saveServerQboConnection } from '@/lib/qbo/connection-store';
import { loadSharedPlutusEnv } from './shared-env';

loadSharedPlutusEnv();

function cents(value: number): number {
  return Math.round(value * 100);
}

function numericValue(value: bigint | number | null): number {
  return Number(value ?? 0);
}

function requireOneAccountByName<T extends { Name: string; Active?: boolean }>(
  accounts: T[],
  name: string,
): T {
  const matches = accounts.filter((account) => account.Active !== false && account.Name === name);
  if (matches.length !== 1) {
    throw new Error(
      `Expected exactly one active QBO account named ${name}, found ${matches.length}`,
    );
  }
  return matches[0]!;
}

async function main() {
  let connection = await getQboConnection();
  if (connection === null) {
    throw new Error('QBO connection is required for fresh FIFO COGS audit');
  }

  const accountResult = await fetchAccounts(connection, { includeInactive: true });
  if (accountResult.updatedConnection) {
    connection = accountResult.updatedConnection;
    await saveServerQboConnection(connection);
  }
  const inventoryAssetPlutusAccount = requireOneAccountByName(
    accountResult.accounts,
    'Inventory Asset - Plutus',
  );

  const [layerRows, postingRows] = await Promise.all([
    db.$queryRaw<Array<{ marketplace: string; remainingValueCents: bigint | number | null }>>`
      SELECT "marketplace", COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)), 0) AS "remainingValueCents"
      FROM "CostLayer"
      GROUP BY "marketplace"
      ORDER BY "marketplace" ASC
    `,
    db.$queryRaw<
      Array<{
        marketplace: string;
        settlementId: string;
        postingCents: bigint | number | null;
        consumptionCents: bigint | number | null;
      }>
    >`
      SELECT
        posting."marketplace",
        posting."settlementId",
        COALESCE(SUM(consumption."cogsAmountCents"), 0) AS "postingCents",
        COALESCE(SUM(consumption."cogsAmountCents"), 0) AS "consumptionCents"
      FROM "SettlementPosting" posting
      LEFT JOIN "CogsConsumption" consumption ON consumption."settlementPostingId" = posting."id"
      WHERE posting."postingType" = 'COGS'
      GROUP BY posting."marketplace", posting."settlementId"
      ORDER BY posting."settlementId" DESC
    `,
  ]);

  const plutusRemainingInventoryAssetCents = layerRows.reduce(
    (sum, row) => sum + numericValue(row.remainingValueCents),
    0,
  );
  const qboInventoryAssetPlutusCents = cents(
    Number(
      inventoryAssetPlutusAccount.CurrentBalanceWithSubAccounts ??
        inventoryAssetPlutusAccount.CurrentBalance ??
        0,
    ),
  );

  process.stdout.write(
    JSON.stringify(
      {
        qboInventoryAssetPlutus: {
          accountId: inventoryAssetPlutusAccount.Id,
          balanceCents: qboInventoryAssetPlutusCents,
        },
        plutusRemainingInventoryAssetCents,
        inventoryAssetTieout: {
          deltaCents: qboInventoryAssetPlutusCents - plutusRemainingInventoryAssetCents,
          ok: qboInventoryAssetPlutusCents === plutusRemainingInventoryAssetCents,
        },
        plutusRemainingInventoryAssetSupport: layerRows.map((row) => ({
          ...row,
          remainingValueCents: numericValue(row.remainingValueCents),
        })),
        cogsPostingConsumptionTieout: postingRows.map((row) => ({
          marketplace: row.marketplace,
          settlementId: row.settlementId,
          postingCents: numericValue(row.postingCents),
          consumptionCents: numericValue(row.consumptionCents),
          ok: numericValue(row.postingCents) === numericValue(row.consumptionCents),
        })),
      },
      null,
      2,
    ),
  );
  process.stdout.write('\n');
}

main()
  .catch((error) => {
    process.stderr.write(
      `${error instanceof Error ? (error.stack ?? error.message) : String(error)}\n`,
    );
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
