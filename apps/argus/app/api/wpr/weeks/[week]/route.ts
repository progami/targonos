import { NextResponse } from 'next/server';
import { getWprWeekBundle } from '@/lib/wpr/reader';

type RouteContext = {
  params: Promise<{ week: string }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const { week } = await context.params;
    const bundle = await getWprWeekBundle(week);
    return NextResponse.json(bundle);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load the requested WPR week.';
    const status = message.startsWith('Unknown WPR week:') ? 404 : 500;
    return NextResponse.json({ error: message }, { status });
  }
}
