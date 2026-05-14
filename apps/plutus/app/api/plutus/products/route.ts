import { NextResponse } from 'next/server';
import { createLogger } from '@targon/logger';

import { db } from '@/lib/db';

const logger = createLogger({ name: 'plutus-products' });

export async function GET() {
  try {
    const products = await db.canonicalProduct.findMany({
      orderBy: [
        { productGroup: { code: 'asc' } },
        { productGroup: { name: 'asc' } },
        { name: 'asc' },
        { id: 'asc' },
      ],
      select: {
        id: true,
        name: true,
        active: true,
        productGroup: {
          select: {
            id: true,
            code: true,
            name: true,
            active: true,
          },
        },
        aliases: {
          orderBy: [
            { marketplace: 'asc' },
            { aliasType: 'asc' },
            { value: 'asc' },
            { id: 'asc' },
          ],
          select: {
            id: true,
            marketplace: true,
            aliasType: true,
            value: true,
            active: true,
          },
        },
      },
    });

    return NextResponse.json({ products });
  } catch (error) {
    logger.error('Failed to list Plutus products', error);
    return NextResponse.json(
      { error: 'Failed to list products', details: error instanceof Error ? error.message : String(error) },
      { status: 500 },
    );
  }
}
