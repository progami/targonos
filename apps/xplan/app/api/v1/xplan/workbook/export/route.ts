import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';

export const GET = withXPlanAuth(async () => {
  return NextResponse.json(
    {
      error: 'Workbook export is temporarily disabled while we finalize the new template.',
    },
    { status: 410 },
  );
});
