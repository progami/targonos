import 'server-only';

type ForecastModel = 'ETS' | 'PROPHET' | 'ARIMA' | 'THETA' | 'NEURALPROPHET';

type ForecastPoint = {
  t: string;
  yhat: number;
  yhatLower: number | null;
  yhatUpper: number | null;
  isFuture: boolean;
};

type ForecastMetrics = {
  sampleCount: number;
  mae: number | null;
  rmse: number | null;
  mape: number | null;
};

export type MlServiceForecastResult = {
  points: ForecastPoint[];
  meta: {
    horizon: number;
    historyCount: number;
    intervalLevel: number | null;
    metrics: ForecastMetrics;
  };
};

export type MlServiceBatchForecastResult = {
  items: Array<{ id: string } & MlServiceForecastResult>;
};

function resolveKairosMlBaseUrl(): string | null {
  const raw = process.env.KAIROS_ML_URL?.trim();
  if (!raw) return null;

  try {
    const url = new URL(raw);
    return url.toString().replace(/\/+$/, '');
  } catch {
    throw new Error('KAIROS_ML_URL must be a valid URL.');
  }
}

async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch {
    return '';
  }
}

export async function runMlForecast(args: {
  model: ForecastModel;
  ds: number[];
  y: number[];
  horizon: number;
  config?: unknown;
  regressors?: Record<string, number[]>;
  regressorsFuture?: Record<string, number[]>;
}): Promise<MlServiceForecastResult> {
  const baseUrl = resolveKairosMlBaseUrl();
  if (!baseUrl) {
    throw new Error('KAIROS_ML_URL is not configured.');
  }

  const endpoint = new URL('/v1/forecast', baseUrl).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model: args.model,
      ds: args.ds,
      y: args.y,
      horizon: args.horizon,
      config: args.config === undefined ? null : args.config,
      regressors: args.regressors === undefined ? null : args.regressors,
      regressorsFuture: args.regressorsFuture === undefined ? null : args.regressorsFuture,
    }),
    signal: AbortSignal.timeout(60_000),
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    const detail = (() => {
      try {
        const parsed = JSON.parse(body) as { detail?: unknown };
        return typeof parsed?.detail === 'string' ? parsed.detail : null;
      } catch {
        return null;
      }
    })();

    const message = detail ?? body;
    if (message) {
      throw new Error(message);
    }
    throw new Error(`Kairos ML service error (${response.status}).`);
  }

  const data = (await response.json()) as unknown;
  if (!data || typeof data !== 'object') {
    throw new Error('Kairos ML service returned an invalid response.');
  }

  return data as MlServiceForecastResult;
}

export async function runMlBatchForecast(args: {
  items: Array<{
    id: string;
    model: ForecastModel;
    ds: number[];
    y: number[];
    horizon: number;
    config?: unknown;
  }>;
}): Promise<MlServiceBatchForecastResult> {
  const baseUrl = resolveKairosMlBaseUrl();
  if (!baseUrl) {
    throw new Error('KAIROS_ML_URL is not configured.');
  }

  const endpoint = new URL('/v1/forecast/batch', baseUrl).toString();
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      items: args.items.map((item) => ({
        id: item.id,
        model: item.model,
        ds: item.ds,
        y: item.y,
        horizon: item.horizon,
        config: item.config === undefined ? null : item.config,
      })),
    }),
    signal: AbortSignal.timeout(120_000),
  });

  if (!response.ok) {
    const body = await readResponseBody(response);
    const detail = (() => {
      try {
        const parsed = JSON.parse(body) as { detail?: unknown };
        return typeof parsed?.detail === 'string' ? parsed.detail : null;
      } catch {
        return null;
      }
    })();

    const message = detail ?? body;
    if (message) {
      throw new Error(message);
    }
    throw new Error(`Kairos ML service error (${response.status}).`);
  }

  const data = (await response.json()) as unknown;
  if (!data || typeof data !== 'object') {
    throw new Error('Kairos ML service returned an invalid response.');
  }

  return data as MlServiceBatchForecastResult;
}
