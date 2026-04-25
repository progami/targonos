import { NextResponse } from 'next/server';
import { parseArgusMarket } from '@/lib/argus-market';
import { getWprChangeLogWeek } from '@/lib/wpr/reader';

type RouteContext = {
  params: Promise<{ week: string }>;
};

export async function GET(request: Request, context: RouteContext) {
  try {
    const { week } = await context.params;
    const { searchParams } = new URL(request.url);
    const market = parseArgusMarket(searchParams.get('market'));
    const entries = await getWprChangeLogWeek(week, market);
    return NextResponse.json(entries);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load the requested WPR changelog week.';
    const status = message.startsWith('Unknown WPR week:') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
