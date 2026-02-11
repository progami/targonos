import type { WatchTarget } from '@targon/prisma-argus';
import { prisma } from '@/lib/prisma';
import { requireEnv } from '@/lib/env';
import { createArgusTransport, parseRecipients } from './smtp';
import { buildListingSignalExtracted, buildSignalChangeSummary } from '@/lib/capture/signal';

function minutesBetween(a: Date, b: Date): number {
  return Math.abs(a.getTime() - b.getTime()) / 60_000;
}

function parseNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getAsinPrice(normalized: unknown): number | undefined {
  const obj = normalized as any;
  return parseNumber(obj?.price);
}

function getAsinTitle(normalized: unknown): string | undefined {
  const obj = normalized as any;
  const title = obj?.title;
  return typeof title === 'string' ? title : undefined;
}

function getThresholdNumber(thresholds: unknown, key: string): number | undefined {
  const value = (thresholds as any)?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}

function getThresholdBoolean(thresholds: unknown, key: string): boolean | undefined {
  const value = (thresholds as any)?.[key];
  return typeof value === 'boolean' ? value : undefined;
}

function ruleTriggered(input: {
  target: WatchTarget;
  thresholds: unknown;
  prev: unknown;
  curr: unknown;
}): { triggered: boolean; lines: string[] } {
  const lines: string[] = [];

  const prevSignal = buildListingSignalExtracted(input.prev);
  const currSignal = buildListingSignalExtracted(input.curr);
  const summary = buildSignalChangeSummary(prevSignal, currSignal);

  const watchTitle = getThresholdBoolean(input.thresholds, 'titleChanged') ?? true;
  if (watchTitle) {
    const prevTitle = getAsinTitle(input.prev);
    const currTitle = getAsinTitle(input.curr);
    if (prevTitle && currTitle && prevTitle !== currTitle) {
      lines.push('Title changed');
    }
  }

  const prevPrice = getAsinPrice(input.prev);
  const currPrice = getAsinPrice(input.curr);
  if (prevPrice !== undefined && currPrice !== undefined && prevPrice !== currPrice) {
    const absThreshold = getThresholdNumber(input.thresholds, 'priceDeltaAbs') ?? 1;
    const pctThreshold = getThresholdNumber(input.thresholds, 'priceDeltaPct') ?? 5;

    const delta = currPrice - prevPrice;
    const absDelta = Math.abs(delta);
    const pctDelta = prevPrice !== 0 ? (absDelta / Math.abs(prevPrice)) * 100 : undefined;
    const pctOk = pctDelta !== undefined && pctDelta >= pctThreshold;
    const absOk = absDelta >= absThreshold;
    if (pctOk || absOk) {
      lines.push(
        `Price: ${prevPrice} → ${currPrice}${pctDelta !== undefined ? ` (${pctDelta.toFixed(1)}%)` : ''}`,
      );
    }
  }

  const watchImages = getThresholdBoolean(input.thresholds, 'imagesChanged') ?? true;
  if (watchImages && summary.imagesChanged) {
    lines.push('Images changed');
  }

  return { triggered: lines.length > 0, lines };
}

export async function dispatchAlertsForRun(input: {
  target: WatchTarget;
  runId: string;
  previousNormalizedExtracted: unknown;
  currentNormalizedExtracted: unknown;
}) {
  const rules = await prisma.alertRule.findMany({ where: { targetId: input.target.id, enabled: true } });
  if (rules.length === 0) return;

  const minMinutesRaw = process.env.ARGUS_ALERT_MIN_MINUTES_BETWEEN_SAME_TARGET;
  const minMinutes = minMinutesRaw ? Number.parseInt(minMinutesRaw, 10) : 180;
  if (Number.isFinite(minMinutes) && minMinutes > 0) {
    const lastEvent = await prisma.alertEvent.findFirst({
      where: { rule: { targetId: input.target.id } },
      orderBy: { sentAt: 'desc' },
    });
    if (lastEvent && minutesBetween(new Date(), lastEvent.sentAt) < minMinutes) {
      return;
    }
  }

  const triggeredRules = rules
    .map((rule) => ({ rule, summary: ruleTriggered({ target: input.target, thresholds: rule.thresholds, prev: input.previousNormalizedExtracted, curr: input.currentNormalizedExtracted }) }))
    .filter((r) => r.summary.triggered);
  if (triggeredRules.length === 0) return;

  const to = parseRecipients();
  const from = requireEnv('ARGUS_ALERT_FROM_EMAIL');
  const subject = `[Argus] ${input.target.marketplace} ${input.target.label}: change detected`;

  const baseUrl = requireEnv('NEXT_PUBLIC_APP_URL');
  const targetUrl = `${baseUrl}/monitoring/${input.target.id}`;
  const body = `${subject}\n\n${triggeredRules.flatMap((r) => r.summary.lines).map((l) => `- ${l}`).join('\n')}\n\nOpen: ${targetUrl}\n`;

  const transporter = createArgusTransport();
  await transporter.sendMail({
    from,
    to,
    subject,
    text: body,
  });

  await prisma.alertEvent.createMany({
    data: triggeredRules.map(({ rule }) => ({
      ruleId: rule.id,
      runId: input.runId,
      toEmails: to,
      subject,
      bodyPreview: body.slice(0, 500),
    })),
    skipDuplicates: true,
  });
}
