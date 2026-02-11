import { NextResponse } from 'next/server';
import { withArgusAuth } from '@/lib/api/auth';
import { runTalosSync } from '@/lib/imports/talos-sync';

export const POST = withArgusAuth(async () => {
  const result = await runTalosSync();
  return NextResponse.json({ importRun: result });
});

