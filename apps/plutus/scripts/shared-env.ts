import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../..');
const { loadEnvForApp } = require('../../../scripts/lib/shared-env.cjs') as {
  loadEnvForApp: (options: {
    repoRoot: string;
    appName: string;
    mode: string;
    targetEnv: NodeJS.ProcessEnv;
  }) => void;
};

function resolvePlutusScriptEnvMode(): string {
  if (process.env.PLUTUS_ENV_MODE && process.env.PLUTUS_ENV_MODE.trim().length > 0) {
    return process.env.PLUTUS_ENV_MODE;
  }
  if (process.env.TARGONOS_ENV_MODE && process.env.TARGONOS_ENV_MODE.trim().length > 0) {
    return process.env.TARGONOS_ENV_MODE;
  }
  return 'local';
}

export function loadSharedPlutusEnv(): void {
  loadEnvForApp({
    repoRoot,
    appName: 'plutus',
    mode: resolvePlutusScriptEnvMode(),
    targetEnv: process.env,
  });
}
