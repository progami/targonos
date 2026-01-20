import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

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
    const brandMap = new Map(brands.map((b: { id: string; name: string }) => [b.name, b.id]));

    // Validate all brands exist
    for (const sku of skus) {
      if (!brandMap.has(sku.brand)) {
        return NextResponse.json({ error: `Brand not found: ${sku.brand}` }, { status: 400 });
      }
    }

    // Delete all existing skus and create new ones
    await db.$transaction(async (tx: typeof db) => {
      await tx.sku.deleteMany();

      for (const sku of skus) {
        await tx.sku.create({
          data: {
            sku: sku.sku,
            productName: sku.productName || null,
            brandId: brandMap.get(sku.brand)!,
            asin: sku.asin || null,
          },
        });
      }
    });

    // Fetch updated skus
    const updatedSkus = await db.sku.findMany({
      include: { brand: true },
      orderBy: { createdAt: 'asc' },
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
