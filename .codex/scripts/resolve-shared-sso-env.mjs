import fs from 'node:fs';
import path from 'node:path';

function readEnvFile(envPath) {
  if (!fs.existsSync(envPath)) {
    return null;
  }

  const values = {};
  const text = fs.readFileSync(envPath, 'utf8');

  for (const rawLine of text.split('\n')) {
    const line = rawLine.trim();
    if (line === '' || line.startsWith('#')) {
      continue;
    }

    const separatorIndex = line.indexOf('=');
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).replace(/^export\s+/, '').trim();
    let value = line.slice(separatorIndex + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    values[key] = value;
  }

  return values;
}

function validateSharedSsoEnv(envPath) {
  const values = readEnvFile(envPath);
  if (values === null) {
    return `Missing env file: ${envPath}`;
  }

  const requiredKeys = [
    'NEXTAUTH_URL',
    'PORTAL_AUTH_URL',
    'NEXT_PUBLIC_PORTAL_AUTH_URL',
    'COOKIE_DOMAIN',
  ];

  for (const key of requiredKeys) {
    const value = values[key];
    if (value === undefined || value === '') {
      return `Missing ${key} in ${envPath}`;
    }
  }

  const expectedValues = {
    NEXTAUTH_URL: 'https://dev-os.targonglobal.com',
    PORTAL_AUTH_URL: 'https://dev-os.targonglobal.com',
    NEXT_PUBLIC_PORTAL_AUTH_URL: 'https://dev-os.targonglobal.com',
    COOKIE_DOMAIN: '.dev-os.targonglobal.com',
  };

  for (const [key, expected] of Object.entries(expectedValues)) {
    if (values[key] !== expected) {
      return `${key} in ${envPath} must be ${expected}. Found ${values[key]}.`;
    }
  }

  return null;
}

function fail(message) {
  console.error(`[shared-sso-env] ${message}`);
  process.exit(1);
}

function resolveSharedSsoEnvPath(sourceRoot) {
  const explicitPath = process.env.CODEX_SHARED_SSO_ENV_PATH?.trim();
  const candidates = [];

  if (explicitPath) {
    candidates.push(path.resolve(explicitPath));
  }

  candidates.push(path.join(sourceRoot, 'apps/sso/.env.dev'));
  candidates.push(path.join(sourceRoot, 'apps/sso/.env.local'));
  candidates.push(path.join(path.dirname(sourceRoot), 'targonos-dev/apps/sso/.env.dev'));
  candidates.push(path.join(path.dirname(sourceRoot), 'targonos-dev/apps/sso/.env.local'));

  const seen = new Set();
  const failures = [];

  for (const candidate of candidates) {
    const resolved = path.resolve(candidate);
    if (seen.has(resolved)) {
      continue;
    }
    seen.add(resolved);

    const validationError = validateSharedSsoEnv(resolved);
    if (validationError === null) {
      return resolved;
    }

    failures.push(validationError);
  }

  fail(failures.join('\n'));
}

const sourceRootArg = process.argv[2];
if (sourceRootArg === undefined) {
  fail('Usage: node ./.codex/scripts/resolve-shared-sso-env.mjs <source-root>');
}

const resolvedPath = resolveSharedSsoEnvPath(path.resolve(sourceRootArg));
process.stdout.write(`${resolvedPath}\n`);
