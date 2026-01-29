import { NextRequest, NextResponse } from 'next/server';
import { getTalosPrisma } from '@/lib/talos-db';

export async function GET(request: NextRequest) {
  const country = request.nextUrl.searchParams.get('country') as 'US' | 'UK';
  if (country !== 'US' && country !== 'UK') {
    return NextResponse.json({ error: 'country must be US or UK' }, { status: 400 });
  }

  const talos = getTalosPrisma(country);
  const skus = await talos.sku.findMany({
    select: { skuCode: true, asin: true, description: true },
    where: { isActive: true },
    orderBy: { skuCode: 'asc' },
  });

  return NextResponse.json({ skus });
}
