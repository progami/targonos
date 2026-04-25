import { NextResponse } from 'next/server';
import { parseArgusMarket } from '@/lib/argus-market';
import { getWprWeekSummary } from '@/lib/wpr/reader';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const market = parseArgusMarket(searchParams.get('market'));
    const summary = await getWprWeekSummary(market);
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load WPR weeks.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
