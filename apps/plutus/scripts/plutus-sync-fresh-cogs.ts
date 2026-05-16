import { buildFreshStartCogsPlan, type FreshCostLayer } from '@/lib/plutus/fresh-start-fifo-cogs';
import { db } from '@/lib/db';

type CliOptions = {
  settlementId: string;
  marketplace: string;
  txnDate: string;
  currency: string;
  sold: Array<{ sku: string; quantity: number }>;
  apply: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let settlementId = '';
  let marketplace = 'amazon.com';
  let txnDate = new Date().toISOString().slice(0, 10);
  let currency = 'USD';
  let soldJson = '';
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    const next = argv[index + 1];
    if (arg === '--settlement-id') {
      if (!next) throw new Error('Missing value for --settlement-id');
      settlementId = next;
      index += 1;
    } else if (arg === '--marketplace') {
      if (!next) throw new Error('Missing value for --marketplace');
      marketplace = next;
      index += 1;
    } else if (arg === '--txn-date') {
      if (!next) throw new Error('Missing value for --txn-date');
      txnDate = next;
      index += 1;
    } else if (arg === '--currency') {
      if (!next) throw new Error('Missing value for --currency');
      currency = next;
      index += 1;
    } else if (arg === '--sold-json') {
      if (!next) throw new Error('Missing value for --sold-json');
      soldJson = next;
      index += 1;
    } else if (arg === '--apply') {
      apply = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (settlementId === '' || soldJson === '') {
    throw new Error('Usage: pnpm inventory:fresh:cogs:sync -- --settlement-id ID --sold-json \'[{"sku":"CS-007","quantity":1}]\' [--apply]');
  }
  return { settlementId, marketplace, txnDate, currency, sold: JSON.parse(soldJson) as Array<{ sku: string; quantity: number }>, apply };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const dbLayers = await db.costLayer.findMany({
    where: { marketplace: options.marketplace },
    orderBy: [{ receiptDate: 'asc' }, { poNumber: 'asc' }, { id: 'asc' }],
  });
  const layers: FreshCostLayer[] = dbLayers.map((layer) => ({
    id: layer.id,
    marketplace: layer.marketplace,
    qboPurchaseOrderId: layer.qboPurchaseOrderId,
    poNumber: layer.poNumber,
    qboPurchaseOrderLineId: layer.qboPurchaseOrderLineId,
    sku: layer.sku,
    qboItemId: layer.qboItemId,
    qtyReceived: layer.qtyReceived,
    qtyRemaining: layer.qtyRemaining,
    landedTotal: layer.landedTotalCents / 100,
    unitCost: Number(layer.unitCost),
    currency: layer.currency,
    status: layer.status,
    receiptDate: layer.receiptDate?.toISOString().slice(0, 10) ?? null,
  }));

  const plan = buildFreshStartCogsPlan({
    settlementId: options.settlementId,
    marketplace: options.marketplace,
    txnDate: options.txnDate,
    currency: options.currency,
    soldUnits: options.sold,
    layers,
  });
  if (!plan.ok) {
    process.stdout.write(JSON.stringify(plan, null, 2));
    process.stdout.write('\n');
    process.exitCode = 1;
    return;
  }
  if (!options.apply) {
    process.stdout.write(JSON.stringify({ dryRun: true, plan }, null, 2));
    process.stdout.write('\n');
    return;
  }

  await db.$transaction(async (tx) => {
    const posting = await tx.settlementPosting.upsert({
      where: {
        marketplace_settlementId_postingType: {
          marketplace: options.marketplace,
          settlementId: options.settlementId,
          postingType: 'COGS',
        },
      },
      create: {
        marketplace: options.marketplace,
        settlementId: options.settlementId,
        postingType: 'COGS',
        txnDate: options.txnDate,
        currency: options.currency,
        qboDocNumber: plan.qboCogsJournalDraft?.docNumber ?? null,
        sourceHash: options.settlementId,
        postingHash: JSON.stringify(plan.consumptions),
      },
      update: {
        txnDate: options.txnDate,
        currency: options.currency,
        qboDocNumber: plan.qboCogsJournalDraft?.docNumber ?? null,
        postingHash: JSON.stringify(plan.consumptions),
      },
    });

    await tx.cogsConsumption.deleteMany({ where: { settlementPostingId: posting.id } });
    for (const line of plan.consumptions) {
      await tx.cogsConsumption.create({
        data: {
          settlementPostingId: posting.id,
          settlementId: line.settlementId,
          marketplace: line.marketplace,
          sku: line.sku,
          poNumber: line.poNumber,
          costLayerId: line.costLayerId,
          qtyConsumed: line.qtyConsumed,
          unitCost: line.unitCost,
          cogsAmountCents: Math.round(line.cogsAmount * 100),
          currency: options.currency,
        },
      });
      await tx.costLayer.update({
        where: { id: line.costLayerId },
        data: { qtyRemaining: { decrement: line.qtyConsumed } },
      });
    }
  });

  process.stdout.write(JSON.stringify({ applied: true, consumptionCount: plan.consumptions.length, cogsTotal: plan.cogsTotal }, null, 2));
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
