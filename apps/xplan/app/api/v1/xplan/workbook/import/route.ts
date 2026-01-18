import { NextResponse } from 'next/server';
import { withXPlanAuth } from '@/lib/api/auth';

export const POST = withXPlanAuth(async () => {
  return NextResponse.json(
    {
      error: 'Workbook import is temporarily disabled while we finalize the new template.',
    },
    { status: 410 },
  );
});
