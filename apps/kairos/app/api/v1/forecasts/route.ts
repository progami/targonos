import { NextResponse } from 'next/server';
import { z } from 'zod';
import { Prisma } from '@targon/prisma-kairos';

import { withKairosAuth } from '@/lib/api/auth';
import prisma from '@/lib/prisma';
import { buildKairosOwnershipWhere, getKairosActor } from '@/lib/access';
import { etsConfigSchema, prophetConfigSchema } from '@/lib/forecasts/config';
import { runForecastNow } from '@/lib/forecasts/run';

const createSchema = z.object({
  name: z.string().trim().min(1),
  targetSeriesId: z.string().min(1),
  regressors: z
    .array(
      z
        .object({
          seriesId: z.string().min(1),
          futureMode: z.enum(['FORECAST', 'USER_INPUT']).default('FORECAST'),
        })
        .strict(),
    )
    .optional()
    .default([]),
  model: z.enum(['PROPHET', 'ETS', 'ARIMA', 'THETA', 'NEURALPROPHET']).default('PROPHET'),
  horizon: z.coerce.number().int().min(1).max(3650),
  runNow: z.coerce.boolean().optional().default(true),
  config: z.unknown().optional(),
});

export const GET = withKairosAuth(async (_request, session) => {
  const actor = getKairosActor(session);

  const forecasts = await prisma.forecast.findMany({
    where: buildKairosOwnershipWhere(actor),
    orderBy: { updatedAt: 'desc' },
    include: {
      targetSeries: {
        select: {
          id: true,
          name: true,
          source: true,
          granularity: true,
          query: true,
          geo: true,
        },
      },
      regressors: {
        include: {
          series: {
            select: {
              id: true,
              name: true,
              source: true,
            },
          },
        },
      },
    },
  });

  return NextResponse.json({
    forecasts: forecasts.map((row) => ({
      id: row.id,
      name: row.name,
      model: row.model,
      horizon: row.horizon,
      status: row.status,
      lastRunAt: row.lastRunAt?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      targetSeries: row.targetSeries,
      regressors: row.regressors.map((r) => ({
        id: r.id,
        seriesId: r.seriesId,
        futureMode: r.futureMode,
        series: r.series,
      })),
    })),
  });
});

export const POST = withKairosAuth(async (request, session) => {
  try {
    const json = await request.json().catch(() => null);
    const payload = createSchema.parse(json);

    const actor = getKairosActor(session);
    if (!actor.id && !actor.email) {
      return NextResponse.json({ error: 'User identity is missing.' }, { status: 403 });
    }

    const targetSeries = await prisma.timeSeries.findFirst({
      where: {
        id: payload.targetSeriesId,
        ...buildKairosOwnershipWhere(actor),
      },
      select: {
        id: true,
        name: true,
        source: true,
        granularity: true,
        query: true,
        geo: true,
      },
    });

    if (!targetSeries) {
      return NextResponse.json({ error: 'Target time series not found' }, { status: 404 });
    }

    // Validate regressor series if provided
    let regressorSeries: { id: string; name: string; source: string }[] = [];
    const regressorSeriesIds = payload.regressors.map((r) => r.seriesId);
    if (regressorSeriesIds.length > 0) {
      if (payload.model !== 'PROPHET') {
        return NextResponse.json(
          { error: 'Regressors are only supported for Prophet forecasts.' },
          { status: 400 },
        );
      }

      regressorSeries = await prisma.timeSeries.findMany({
        where: {
          id: { in: regressorSeriesIds },
          ...buildKairosOwnershipWhere(actor),
        },
        select: {
          id: true,
          name: true,
          source: true,
        },
      });

      if (regressorSeries.length !== regressorSeriesIds.length) {
        return NextResponse.json({ error: 'One or more regressor series not found' }, { status: 404 });
      }
    }

    const config =
      payload.config === undefined
        ? null
        : payload.model === 'PROPHET' || payload.model === 'NEURALPROPHET'
          ? prophetConfigSchema.parse(payload.config)
          : etsConfigSchema.parse(payload.config);

    const configJson = config
      ? (JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue)
      : undefined;

    const forecast = await prisma.forecast.create({
      data: {
        name: payload.name,
        model: payload.model,
        horizon: payload.horizon,
        config: configJson,
        status: 'DRAFT',
        targetSeriesId: targetSeries.id,
        createdById: actor.id,
        createdByEmail: actor.email,
        regressors: {
          create: payload.regressors.map((regressor) => ({
            seriesId: regressor.seriesId,
            futureMode: regressor.futureMode,
          })),
        },
      },
      select: {
        id: true,
        name: true,
        model: true,
        horizon: true,
        status: true,
        lastRunAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!payload.runNow) {
      const regressorSeriesById = new Map(regressorSeries.map((series) => [series.id, series]));
      return NextResponse.json({
        forecast: {
          ...forecast,
          lastRunAt: forecast.lastRunAt?.toISOString() ?? null,
          createdAt: forecast.createdAt.toISOString(),
          updatedAt: forecast.updatedAt.toISOString(),
          targetSeries,
          regressors: payload.regressors.map((regressor) => {
            const series = regressorSeriesById.get(regressor.seriesId) as { id: string; name: string; source: string };
            return {
              seriesId: series.id,
              futureMode: regressor.futureMode,
              series,
            };
          }),
        },
      });
    }

    const run = await runForecastNow({ forecastId: forecast.id, session });
    if (!run) {
      return NextResponse.json({ error: 'Forecast not found' }, { status: 404 });
    }

    return NextResponse.json({
      forecast: {
        id: forecast.id,
        name: forecast.name,
        model: forecast.model,
        horizon: forecast.horizon,
        status: run.forecast.status,
        lastRunAt: run.forecast.lastRunAt,
        createdAt: forecast.createdAt.toISOString(),
        updatedAt: forecast.updatedAt.toISOString(),
        targetSeries,
        regressors: (() => {
          const regressorSeriesById = new Map(regressorSeries.map((series) => [series.id, series]));
          return payload.regressors.map((regressor) => {
            const series = regressorSeriesById.get(regressor.seriesId) as { id: string; name: string; source: string };
            return {
              seriesId: series.id,
              futureMode: regressor.futureMode,
              series,
            };
          });
        })(),
      },
      run: run.run,
    });
  } catch (error) {
    console.error('[kairos] Forecast create failed', error);

    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues.at(0)?.message ?? 'Invalid request payload.' },
        { status: 400 },
      );
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      const message =
        error.code === 'P2021'
          ? 'Kairos database tables are missing. Please run migrations.'
          : 'Database error. Please try again.';
      return NextResponse.json({ error: message }, { status: 500 });
    }

    const message = error instanceof Error ? error.message : 'Create failed.';
    return NextResponse.json({ error: message }, { status: 500 });
  }
});
