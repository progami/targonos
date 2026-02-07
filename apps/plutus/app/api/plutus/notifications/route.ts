import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/current-user';

export const runtime = 'nodejs';

const DEFAULTS = {
  onNewSettlement: true,
  onSettlementPosted: true,
  onProcessingError: true,
  onMonthlyAnalytics: false,
};

export async function GET() {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const prefs = await db.notificationPreference.findUnique({
    where: { userId: user.id },
  });

  if (!prefs) {
    return NextResponse.json(DEFAULTS);
  }

  return NextResponse.json({
    onNewSettlement: prefs.onNewSettlement,
    onSettlementPosted: prefs.onSettlementPosted,
    onProcessingError: prefs.onProcessingError,
    onMonthlyAnalytics: prefs.onMonthlyAnalytics,
  });
}

export async function POST(request: Request) {
  const user = await getCurrentUser();
  if (!user) {
    return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
  }

  const body = await request.json();

  const data = {
    onNewSettlement: typeof body.onNewSettlement === 'boolean' ? body.onNewSettlement : DEFAULTS.onNewSettlement,
    onSettlementPosted: typeof body.onSettlementPosted === 'boolean' ? body.onSettlementPosted : DEFAULTS.onSettlementPosted,
    onProcessingError: typeof body.onProcessingError === 'boolean' ? body.onProcessingError : DEFAULTS.onProcessingError,
    onMonthlyAnalytics: typeof body.onMonthlyAnalytics === 'boolean' ? body.onMonthlyAnalytics : DEFAULTS.onMonthlyAnalytics,
  };

  const prefs = await db.notificationPreference.upsert({
    where: { userId: user.id },
    create: { userId: user.id, ...data },
    update: data,
  });

  return NextResponse.json({
    onNewSettlement: prefs.onNewSettlement,
    onSettlementPosted: prefs.onSettlementPosted,
    onProcessingError: prefs.onProcessingError,
    onMonthlyAnalytics: prefs.onMonthlyAnalytics,
  });
}
