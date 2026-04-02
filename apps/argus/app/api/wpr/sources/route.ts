import { NextResponse } from 'next/server';
import { getWprSources } from '@/lib/wpr/reader';

export async function GET() {
  try {
    const overview = await getWprSources();
    return NextResponse.json(overview);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load WPR source coverage.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
