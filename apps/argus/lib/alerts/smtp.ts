import nodemailer from 'nodemailer';
import { requireEnv } from '@/lib/env';

export function createArgusTransport() {
  const host = requireEnv('ARGUS_SMTP_HOST');
  const port = Number.parseInt(requireEnv('ARGUS_SMTP_PORT'), 10);
  const user = requireEnv('ARGUS_SMTP_USER');
  const pass = requireEnv('ARGUS_SMTP_PASS');
  const secure = requireEnv('ARGUS_SMTP_SECURE') === 'true';

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

export function parseRecipients(): string[] {
  const raw = requireEnv('ARGUS_ALERT_TO_EMAILS');
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

