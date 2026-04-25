import { NextResponse } from 'next/server';
import { parseArgusMarket } from '@/lib/argus-market';
import { getWprPayload } from '@/lib/wpr/reader';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const market = parseArgusMarket(searchParams.get('market'));
    const payload = await getWprPayload(market);
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load the WPR payload.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
