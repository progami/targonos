import { NextResponse } from 'next/server';
import { getWprPayload } from '@/lib/wpr/reader';

export async function GET() {
  try {
    const payload = await getWprPayload();
    return NextResponse.json(payload);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load the WPR payload.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
