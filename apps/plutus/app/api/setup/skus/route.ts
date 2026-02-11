import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@targon/prisma-plutus';
import { db } from '@/lib/db';
import { z } from 'zod';
import { getCurrentUser } from '@/lib/current-user';
import { logAudit } from '@/lib/plutus/audit-log';

const SkuSchema = z.object({
  sku: z.string().min(1),
  productName: z.string().optional(),
  brand: z.string().min(1), // Brand name
  asin: z.string().optional(),
});

const SkusInputSchema = z.object({
  skus: z.array(SkuSchema),
});

// POST /api/setup/skus - replace all skus
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { skus } = SkusInputSchema.parse(body);

    // Get brand name to ID mapping
    const brands = await db.brand.findMany();
    const brandMap = new Map(brands.map((b: { id: string; name: string; marketplace: string }) => [b.name, b]));

    // Validate all brands exist
    for (const sku of skus) {
      const brand = brandMap.get(sku.brand);
      if (!brand) {
        return NextResponse.json({ error: `Brand not found: ${sku.brand}` }, { status: 400 });
      }
    }

    const normalizeSkuKey = (raw: string) => raw.trim().replace(/\s+/g, '-').toUpperCase();

    const seenByBrand = new Set<string>();
    const seenByMarketplace = new Map<string, string>();

    for (const sku of skus) {
      const brand = brandMap.get(sku.brand);
      if (!brand) {
        throw new Error(`Brand not found: ${sku.brand}`);
      }

      const normalizedSku = normalizeSkuKey(sku.sku);
      const perBrandKey = `${brand.id}::${normalizedSku}`;
      if (seenByBrand.has(perBrandKey)) {
        return NextResponse.json(
          { error: `Duplicate SKU mapping for brand: ${sku.brand} (${normalizedSku})` },
          { status: 400 },
        );
      }
      seenByBrand.add(perBrandKey);

      const perMarketplaceKey = `${brand.marketplace}::${normalizedSku}`;
      const existingBrand = seenByMarketplace.get(perMarketplaceKey);
      if (existingBrand && existingBrand !== sku.brand) {
        return NextResponse.json(
          { error: `SKU maps to multiple brands in same marketplace: ${normalizedSku} (${existingBrand}, ${sku.brand})` },
          { status: 400 },
        );
      }
      seenByMarketplace.set(perMarketplaceKey, sku.brand);
    }

    // Delete all existing skus and create new ones
    await db.$transaction(async (tx: Prisma.TransactionClient) => {
      await tx.sku.deleteMany();

      for (const sku of skus) {
        const productNameRaw = sku.productName;
        const productName =
          productNameRaw === undefined || productNameRaw.trim() === '' ? null : productNameRaw;

        const asinRaw = sku.asin;
        const asin = asinRaw === undefined || asinRaw.trim() === '' ? null : asinRaw;

        const brand = brandMap.get(sku.brand);
        if (!brand) {
          throw new Error(`Brand not found: ${sku.brand}`);
        }

        await tx.sku.create({
          data: {
            sku: sku.sku,
            productName,
            brandId: brand.id,
            asin,
          },
        });
      }
    });

    // Fetch updated skus
    const updatedSkus = await db.sku.findMany({
      include: { brand: true },
      orderBy: { createdAt: 'asc' },
    });

    const user = await getCurrentUser();
    await logAudit({
      userId: user?.id ?? 'system',
      userName: user?.name ?? user?.email ?? 'system',
      action: 'SKU_UPDATED',
      entityType: 'Sku',
      details: {
        skuCount: updatedSkus.length,
      },
    });

    return NextResponse.json({
      success: true,
      skus: updatedSkus.map((s: { id: string; sku: string; productName: string | null; brand: { name: string }; asin: string | null }) => ({
        id: s.id,
        sku: s.sku,
        productName: s.productName,
        brand: s.brand.name,
        asin: s.asin,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Failed to save SKUs:', error);
    return NextResponse.json({ error: 'Failed to save SKUs' }, { status: 500 });
  }
}
