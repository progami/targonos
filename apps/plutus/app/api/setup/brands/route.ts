import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { z } from 'zod';

const BrandSchema = z.object({
  name: z.string().min(1),
  marketplace: z.string().min(1),
  currency: z.string().min(1),
});

const BrandsInputSchema = z.object({
  brands: z.array(BrandSchema),
});

// POST /api/setup/brands - replace all brands
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { brands } = BrandsInputSchema.parse(body);

    // Delete all existing brands and create new ones in a transaction
    await db.$transaction(async (tx: typeof db) => {
      // Delete all existing brands (cascades to skus)
      await tx.brand.deleteMany();

      // Create new brands
      for (const brand of brands) {
        await tx.brand.create({
          data: {
            name: brand.name,
            marketplace: brand.marketplace,
            currency: brand.currency,
          },
        });
      }
    });

    // Fetch updated brands
    const updatedBrands = await db.brand.findMany({
      orderBy: { createdAt: 'asc' },
    });

    return NextResponse.json({
      success: true,
      brands: updatedBrands.map((b: { id: string; name: string; marketplace: string; currency: string }) => ({
        id: b.id,
        name: b.name,
        marketplace: b.marketplace,
        currency: b.currency,
      })),
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json({ error: 'Invalid input', details: error.errors }, { status: 400 });
    }
    console.error('Failed to save brands:', error);
    return NextResponse.json({ error: 'Failed to save brands' }, { status: 500 });
  }
}
