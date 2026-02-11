export function requireEnv(name: string): string {
  const value = process.env[name];
  if (typeof value !== 'string') {
    throw new Error(`Missing ${name}`);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`Missing ${name}`);
  }
  return trimmed;
}

