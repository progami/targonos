import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

export function loadEnvFromFiles() {
  const nodeEnv = process.env.NODE_ENV;
  const mode = typeof nodeEnv === 'string' ? nodeEnv : 'production';

  const protectedKeys = new Set(Object.keys(process.env));
  const files = ['.env', `.env.${mode}`, '.env.local', `.env.${mode}.local`];

  for (const filename of files) {
    const fullPath = resolve(process.cwd(), filename);
    if (!existsSync(fullPath)) continue;

    const contents = readFileSync(fullPath, 'utf8');
    for (const line of contents.split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const equals = trimmed.indexOf('=');
      if (equals === -1) continue;

      const key = trimmed.slice(0, equals).trim();
      if (!key) continue;
      if (protectedKeys.has(key)) continue;

      let value = trimmed.slice(equals + 1).trim();
      if (
        (value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))
      ) {
        value = value.slice(1, -1);
      }

      process.env[key] = value;
    }
  }
}

