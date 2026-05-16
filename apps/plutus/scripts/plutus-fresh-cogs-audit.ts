import { db } from '@/lib/db';

async function main() {
  const [layerRows, postingRows] = await Promise.all([
    db.$queryRaw<Array<{ marketplace: string; remainingValueCents: bigint | number | null }>>`
      SELECT "marketplace", COALESCE(SUM(ROUND("qtyRemaining" * "unitCost" * 100)), 0) AS "remainingValueCents"
      FROM "CostLayer"
      GROUP BY "marketplace"
      ORDER BY "marketplace" ASC
    `,
    db.$queryRaw<Array<{ marketplace: string; settlementId: string; postingCents: bigint | number | null; consumptionCents: bigint | number | null }>>`
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

  process.stdout.write(
    JSON.stringify(
      {
        plutusRemainingInventoryAssetSupport: layerRows,
        cogsPostingConsumptionTieout: postingRows.map((row) => ({
          ...row,
          ok: Number(row.postingCents ?? 0) === Number(row.consumptionCents ?? 0),
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
    process.stderr.write(`${error instanceof Error ? error.stack ?? error.message : String(error)}\n`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });
