import { promises as fs } from 'node:fs';

import { buildOpeningLayersFromCsv } from '@/lib/plutus/fresh-start-fifo-cogs';
import { db } from '@/lib/db';

type CliOptions = {
  file: string;
  apply: boolean;
};

function parseArgs(argv: string[]): CliOptions {
  let file = '';
  let apply = false;
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--file') {
      const value = argv[index + 1];
      if (!value) throw new Error('Missing value for --file');
      file = value;
      index += 1;
    } else if (arg === '--apply') {
      apply = true;
    } else {
      throw new Error(`Unknown argument ${arg}`);
    }
  }
  if (file === '') throw new Error('Usage: pnpm inventory:opening:import -- --file opening.csv [--apply]');
  return { file, apply };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const csv = await fs.readFile(options.file, 'utf8');
  const layers = buildOpeningLayersFromCsv(csv);

  if (!options.apply) {
    process.stdout.write(JSON.stringify({ dryRun: true, layerCount: layers.length, layers }, null, 2));
    process.stdout.write('\n');
    return;
  }

  for (const layer of layers) {
    await db.costLayer.upsert({
      where: {
        marketplace_poNumber_sku_qboPurchaseOrderLineId: {
          marketplace: layer.marketplace,
          poNumber: layer.poNumber,
          sku: layer.sku,
          qboPurchaseOrderLineId: '',
        },
      },
      create: {
        marketplace: layer.marketplace,
        qboPurchaseOrderId: null,
        poNumber: layer.poNumber,
        qboPurchaseOrderLineId: '',
        sku: layer.sku,
        qboItemId: null,
        qtyReceived: layer.qtyReceived,
        qtyRemaining: layer.qtyRemaining,
        landedTotalCents: Math.round(layer.landedTotal * 100),
        unitCost: layer.unitCost,
        currency: layer.currency,
        status: 'READY',
        lockedAt: new Date(),
        openingRef: layer.openingRef,
      },
      update: {
        qtyReceived: layer.qtyReceived,
        qtyRemaining: layer.qtyRemaining,
        landedTotalCents: Math.round(layer.landedTotal * 100),
        unitCost: layer.unitCost,
        currency: layer.currency,
        status: 'READY',
        lockedAt: new Date(),
        openingRef: layer.openingRef,
      },
    });
  }

  process.stdout.write(JSON.stringify({ applied: true, layerCount: layers.length }, null, 2));
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
