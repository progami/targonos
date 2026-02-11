import crypto from 'crypto';
export { stableStringify } from './stable-json';

export function sha256Hex(input: string | Buffer): string {
  const buffer = typeof input === 'string' ? Buffer.from(input, 'utf8') : input;
  return crypto.createHash('sha256').update(buffer).digest('hex');
}
