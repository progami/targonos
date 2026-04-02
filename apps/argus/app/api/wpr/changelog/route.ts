import { NextResponse } from 'next/server';
import { getWprChangeLog } from '@/lib/wpr/reader';

export async function GET() {
  try {
    const changes = await getWprChangeLog();
    return NextResponse.json(changes);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load the WPR changelog.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
