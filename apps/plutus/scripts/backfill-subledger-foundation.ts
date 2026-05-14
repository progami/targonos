import { promises as fs } from 'node:fs';

import {
  planLegacySubledgerBackfill,
  type LegacySubledgerBackfillPlan,
} from '@/lib/plutus/subledger/backfill';

type PlutusDb = typeof import('@/lib/db').db;
type CanonicalProductLookupDb = Pick<PlutusDb, 'skuAlias'>;

type CliOptions = {
  apply: boolean;
  plutusEnvPath: string;
};

type BackfillSummary = {
  apply: boolean;
  productGroups: number;
  canonicalProducts: number;
  skuAliases: number;
  purchaseOrders: number;
  costLayers: number;
  unassignedCostLayers: number;
};

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
  if (value.startsWith("'") && value.endsWith("'")) {
    value = value.slice(1, -1);
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    value = value.slice(1, -1);
  }

  return { key, value };
}

async function loadPlutusEnvFile(filePath: string): Promise<void> {
  const raw = await fs.readFile(filePath, 'utf8');
  for (const line of raw.split(/\r?\n/)) {
    const parsed = parseDotenvLine(line);
    if (parsed === null) continue;
    process.env[parsed.key] = parsed.value;
  }
}

function parseArgs(argv: string[]): CliOptions {
  let apply = false;
  let plutusEnvPath = '.env.local';

  let i = 0;
  while (i < argv.length) {
    const arg = argv[i]!;

    if (arg === '--') {
      i += 1;
      continue;
    }

    if (arg === '--apply') {
      apply = true;
      i += 1;
      continue;
    }

    if (arg === '--plutus-env') {
      const next = argv[i + 1];
      if (next === undefined) throw new Error('Missing value for --plutus-env');
      plutusEnvPath = next;
      i += 2;
      continue;
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  return { apply, plutusEnvPath };
}

async function buildBackfillPlan(db: PlutusDb): Promise<LegacySubledgerBackfillPlan> {
  const [brands, skus, billMappings, billLineMappings] = await Promise.all([
    db.brand.findMany({
      select: {
        id: true,
        name: true,
        marketplace: true,
        currency: true,
      },
    }),
    db.sku.findMany({
      select: {
        id: true,
        sku: true,
        asin: true,
        productName: true,
        brandId: true,
      },
    }),
    db.billMapping.findMany({
      select: {
        id: true,
        qboBillId: true,
        poNumber: true,
        brandId: true,
        billDate: true,
        vendorName: true,
        totalAmount: true,
      },
    }),
    db.billLineMapping.findMany({
      select: {
        id: true,
        billMappingId: true,
        qboLineId: true,
        component: true,
        amountCents: true,
        sku: true,
        quantity: true,
      },
    }),
  ]);

  return planLegacySubledgerBackfill({
    brands,
    skus,
    billMappings,
    billLineMappings,
  });
}

function summarizeBackfillPlan(plan: LegacySubledgerBackfillPlan, apply: boolean): BackfillSummary {
  return {
    apply,
    productGroups: plan.productGroups.length,
    canonicalProducts: plan.canonicalProducts.length,
    skuAliases: plan.skuAliases.length,
    purchaseOrders: plan.purchaseOrders.length,
    costLayers: plan.costLayers.length,
    unassignedCostLayers: plan.costLayers.filter((layer) => layer.canonicalProductKey === null)
      .length,
  };
}

function parseCanonicalProductKey(
  key: string,
):
  | { type: 'ASIN'; normalizedAsin: string }
  | { type: 'SKU'; marketplace: string; normalizedSku: string } {
  if (key.startsWith('ASIN:')) {
    const normalizedAsin = key.slice('ASIN:'.length);
    if (normalizedAsin === '') throw new Error(`Invalid canonical product key: ${key}`);
    return { type: 'ASIN', normalizedAsin };
  }

  if (key.startsWith('SKU:')) {
    const parts = key.split(':');
    if (parts.length !== 3) throw new Error(`Invalid canonical product key: ${key}`);
    const marketplace = parts[1]!;
    const normalizedSku = parts[2]!;
    if (marketplace === '') throw new Error(`Invalid canonical product key: ${key}`);
    if (normalizedSku === '') throw new Error(`Invalid canonical product key: ${key}`);
    return { type: 'SKU', marketplace, normalizedSku };
  }

  throw new Error(`Invalid canonical product key: ${key}`);
}

async function findCanonicalProductIdByKey(
  db: CanonicalProductLookupDb,
  key: string,
): Promise<string | null> {
  const parsed = parseCanonicalProductKey(key);

  if (parsed.type === 'ASIN') {
    const aliases = await db.skuAlias.findMany({
      where: {
        normalizedAliasType: 'ASIN',
        normalizedValue: parsed.normalizedAsin,
      },
      select: {
        canonicalProductId: true,
      },
    });
    const ids = new Set(aliases.map((alias) => alias.canonicalProductId));
    if (ids.size > 1) {
      throw new Error(`ASIN alias resolves to multiple canonical products: ${key}`);
    }
    const first = ids.values().next();
    return first.done === true ? null : first.value;
  }

  const alias = await db.skuAlias.findUnique({
    where: {
      marketplace_normalizedAliasType_normalizedValue: {
        marketplace: parsed.marketplace,
        normalizedAliasType: 'SKU',
        normalizedValue: parsed.normalizedSku,
      },
    },
    select: {
      canonicalProductId: true,
    },
  });

  return alias === null ? null : alias.canonicalProductId;
}

function getRequiredMapValue(map: Map<string, string>, key: string, label: string): string {
  const value = map.get(key);
  if (value === undefined) throw new Error(`Missing ${label}: ${key}`);
  return value;
}

async function applyBackfillPlan(db: PlutusDb, plan: LegacySubledgerBackfillPlan): Promise<void> {
  await db.$transaction(async (tx) => {
    const productGroupIdByCode = new Map<string, string>();
    for (const productGroup of plan.productGroups) {
      const row = await tx.productGroup.upsert({
        where: { code: productGroup.code },
        update: {
          name: productGroup.name,
          active: true,
        },
        create: {
          code: productGroup.code,
          name: productGroup.name,
          active: true,
        },
      });
      productGroupIdByCode.set(productGroup.code, row.id);
    }

    const canonicalProductIdByKey = new Map<string, string>();
    for (const canonicalProduct of plan.canonicalProducts) {
      const productGroupId = getRequiredMapValue(
        productGroupIdByCode,
        canonicalProduct.productGroupCode,
        'product group',
      );
      const existingId = await findCanonicalProductIdByKey(tx, canonicalProduct.key);
      const row =
        existingId === null
          ? await tx.canonicalProduct.create({
              data: {
                name: canonicalProduct.name,
                productGroupId,
                active: true,
              },
            })
          : await tx.canonicalProduct.update({
              where: { id: existingId },
              data: {
                name: canonicalProduct.name,
                productGroupId,
                active: true,
              },
            });
      canonicalProductIdByKey.set(canonicalProduct.key, row.id);
    }

    for (const alias of plan.skuAliases) {
      const canonicalProductId = getRequiredMapValue(
        canonicalProductIdByKey,
        alias.canonicalProductKey,
        'canonical product',
      );
      await tx.skuAlias.upsert({
        where: {
          marketplace_normalizedAliasType_normalizedValue: {
            marketplace: alias.marketplace,
            normalizedAliasType: alias.normalizedAliasType,
            normalizedValue: alias.normalizedValue,
          },
        },
        update: {
          canonicalProductId,
          aliasType: alias.aliasType,
          value: alias.value,
          normalizedAliasType: alias.normalizedAliasType,
          normalizedValue: alias.normalizedValue,
          active: true,
        },
        create: {
          canonicalProductId,
          marketplace: alias.marketplace,
          aliasType: alias.aliasType,
          value: alias.value,
          normalizedAliasType: alias.normalizedAliasType,
          normalizedValue: alias.normalizedValue,
          active: true,
        },
      });
    }

    const purchaseOrderIdBySourceKey = new Map<string, string>();
    for (const purchaseOrder of plan.purchaseOrders) {
      const row = await tx.purchaseOrder.upsert({
        where: {
          sourceType_sourceId: {
            sourceType: purchaseOrder.sourceType,
            sourceId: purchaseOrder.sourceId,
          },
        },
        update: {
          internalRef: purchaseOrder.internalRef,
          supplierRef: purchaseOrder.supplierRef,
          marketplace: purchaseOrder.marketplace,
        },
        create: {
          internalRef: purchaseOrder.internalRef,
          sourceType: purchaseOrder.sourceType,
          sourceId: purchaseOrder.sourceId,
          supplierRef: purchaseOrder.supplierRef,
          marketplace: purchaseOrder.marketplace,
        },
      });
      purchaseOrderIdBySourceKey.set(
        `${purchaseOrder.sourceType}:${purchaseOrder.sourceId}`,
        row.id,
      );
    }

    for (const costLayer of plan.costLayers) {
      if (costLayer.canonicalProductKey === null) continue;

      const purchaseOrderId = getRequiredMapValue(
        purchaseOrderIdBySourceKey,
        `${costLayer.purchaseOrderSourceType}:${costLayer.purchaseOrderSourceId}`,
        'purchase order',
      );
      const canonicalProductId = getRequiredMapValue(
        canonicalProductIdByKey,
        costLayer.canonicalProductKey,
        'canonical product',
      );

      const existingLayers = await tx.poCostLayer.findMany({
        where: {
          purchaseOrderId,
          canonicalProductId,
          component: costLayer.component,
          sourceQboTxnType: costLayer.sourceQboTxnType,
          sourceQboTxnId: costLayer.sourceQboTxnId,
          sourceQboLineId: costLayer.sourceQboLineId,
        },
        select: {
          id: true,
        },
      });
      if (existingLayers.length > 1) {
        throw new Error(
          `Multiple PO cost layers match QBO line ${costLayer.sourceQboTxnId}:${costLayer.sourceQboLineId}`,
        );
      }

      const data = {
        quantity: costLayer.quantity,
        amountCents: costLayer.amountCents,
        currency: costLayer.currency,
        allocationMethod: 'LEGACY_BILL_LINE_MAPPING',
        sourceQboTxnType: costLayer.sourceQboTxnType,
        sourceQboTxnId: costLayer.sourceQboTxnId,
        sourceQboLineId: costLayer.sourceQboLineId,
      };

      if (existingLayers.length === 0) {
        await tx.poCostLayer.create({
          data: {
            purchaseOrderId,
            canonicalProductId,
            component: costLayer.component,
            ...data,
          },
        });
        continue;
      }

      await tx.poCostLayer.update({
        where: { id: existingLayers[0]!.id },
        data,
      });
    }
  });
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  await loadPlutusEnvFile(options.plutusEnvPath);

  const { db } = await import('@/lib/db');

  try {
    const plan = await buildBackfillPlan(db);
    if (options.apply) {
      await applyBackfillPlan(db, plan);
    }
    console.log(JSON.stringify(summarizeBackfillPlan(plan, options.apply), null, 2));
  } finally {
    await db.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
