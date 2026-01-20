import { NextResponse } from 'next/server';
import { z } from 'zod';

import { withKairosAuth } from '@/lib/api/auth';
import { getKairosActor } from '@/lib/access';
import { ForecastAlreadyRunningError, runForecastNow } from '@/lib/forecasts/run';

const paramsSchema = z.object({
  forecastId: z.string().min(1),
});

const bodySchema = z
  .object({
    model: z.enum(['PROPHET', 'ETS', 'ARIMA', 'THETA', 'NEURALPROPHET']).optional(),
    config: z.unknown().optional(),
  })
  .strict();

export const POST = withKairosAuth(async (request, session, context: { params: Promise<unknown> }) => {
  try {
    const rawParams = await context.params;
    const safeParams =
      rawParams && typeof rawParams === 'object'
        ? { ...(rawParams as Record<string, unknown>), then: undefined }
        : rawParams;

    const { forecastId } = paramsSchema.parse(safeParams);
    const json = await request.json().catch(() => null);
    const payload = bodySchema.parse(json && typeof json === 'object' ? json : {});

    const actor = getKairosActor(session);
    if (!actor.id && !actor.email) {
      return NextResponse.json({ error: 'User identity is missing.' }, { status: 403 });
    }

    const result = await runForecastNow({
      forecastId,
      session,
      model: payload.model,
      config: payload.config,
    });
    if (!result) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof ForecastAlreadyRunningError) {
      return NextResponse.json({ error: error.message }, { status: 409 });
    }

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.at(0)?.message ?? 'Invalid request payload.' },
        { status: 400 },
      );
    }

    const message = error instanceof Error ? error.message : 'Run failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
