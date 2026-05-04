import { NextResponse } from 'next/server';
import { parseArgusMarket } from '@/lib/argus-market';
import { getWprSources } from '@/lib/wpr/reader';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const market = parseArgusMarket(searchParams.get('market'));
    const overview = await getWprSources(market);
    return NextResponse.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load WPR source coverage.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
