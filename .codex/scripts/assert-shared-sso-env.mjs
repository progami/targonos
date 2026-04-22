import fs from 'node:fs';
import path from 'node:path';

function fail(message) {
  console.error(`[shared-sso-env] ${message}`);
  process.exit(1);
}

function parseEnvFile(text) {
  const values = {};

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

function requireValue(values, key, envPath) {
  const value = values[key];
  if (value === undefined || value === '') {
    fail(`Missing ${key} in ${envPath}`);
  }
  return value;
}

const envPathArg = process.argv[2];
if (envPathArg === undefined) {
  fail('Usage: node ./.codex/scripts/assert-shared-sso-env.mjs <env-path>');
}

const envPath = path.resolve(envPathArg);
if (!fs.existsSync(envPath)) {
  fail(`Missing env file: ${envPath}`);
}

const values = parseEnvFile(fs.readFileSync(envPath, 'utf8'));

const expectedValues = {
  NEXTAUTH_URL: 'https://dev-os.targonglobal.com',
  PORTAL_AUTH_URL: 'https://dev-os.targonglobal.com',
  NEXT_PUBLIC_PORTAL_AUTH_URL: 'https://dev-os.targonglobal.com',
  COOKIE_DOMAIN: '.dev-os.targonglobal.com',
};

for (const [key, expected] of Object.entries(expectedValues)) {
  const actual = requireValue(values, key, envPath);
  if (actual !== expected) {
    fail(`${key} in ${envPath} must be ${expected}. Found ${actual}.`);
  }
}
