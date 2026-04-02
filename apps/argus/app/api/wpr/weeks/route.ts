import { NextResponse } from 'next/server';
import { getWprWeekSummary } from '@/lib/wpr/reader';

export async function GET() {
  try {
    const summary = await getWprWeekSummary();
    return NextResponse.json(summary);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load WPR weeks.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
