import { NextResponse } from "next/server";

type LogLevel = "warn" | "error";

function getRequestId(req: Request): string | undefined {
  const direct = req.headers.get("x-request-id");
  if (direct) return direct;

  const correlation = req.headers.get("x-correlation-id");
  if (correlation) return correlation;

  const trace = req.headers.get("x-amzn-trace-id");
  if (trace) return trace;

  return undefined;
}

function writeLog(level: LogLevel, payload: Record<string, unknown>) {
  const line = JSON.stringify({
    ts: new Date().toISOString(),
    app: "hermes",
    level,
    ...payload,
  });

  if (level === "error") {
    console.error(line);
    return;
  }

  console.warn(line);
}

function getErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "message" in err) {
    const msg = (err as any).message;
    if (typeof msg === "string" && msg) return msg;
  }
  return "Internal Server Error";
}

function getErrorName(err: unknown): string | undefined {
  if (err && typeof err === "object" && "name" in err) {
    const name = (err as any).name;
    if (typeof name === "string" && name) return name;
  }
  return undefined;
}

function getErrorStack(err: unknown): string | undefined {
  if (err && typeof err === "object" && "stack" in err) {
    const stack = (err as any).stack;
    if (typeof stack === "string" && stack) return stack;
  }
  return undefined;
}

export function withApiLogging(
  handlerName: string,
  handler: (req: Request) => Promise<Response>
): (req: Request) => Promise<Response> {
  return async (req: Request) => {
    const startMs = Date.now();
    const url = new URL(req.url);
    const requestId = getRequestId(req);

    try {
      const res = await handler(req);
      const ms = Date.now() - startMs;

      if (res.status >= 400) {
        const level: LogLevel = res.status >= 500 ? "error" : "warn";
        const payload: Record<string, unknown> = {
          type: "api",
          name: handlerName,
          method: req.method,
          path: url.pathname,
          status: res.status,
          ms,
        };
        if (requestId) payload.requestId = requestId;
        writeLog(level, payload);
      }

      return res;
    } catch (err) {
      const ms = Date.now() - startMs;

      const payload: Record<string, unknown> = {
        type: "api",
        name: handlerName,
        method: req.method,
        path: url.pathname,
        status: 500,
        ms,
        error: {
          name: getErrorName(err),
          message: getErrorMessage(err),
          stack: getErrorStack(err),
        },
      };
      if (requestId) payload.requestId = requestId;
      writeLog("error", payload);

      return NextResponse.json({ ok: false, error: getErrorMessage(err) }, { status: 500 });
    }
  };
}

