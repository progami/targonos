import assert from "node:assert/strict";
import test from "node:test";

import {
  assertSpApiEnvConfiguredForHermes,
  loadSpApiConfigForConnection,
} from "./connection-config";

const managedEnvKeys = [
  "HERMES_CONNECTIONS_JSON",
  "HERMES_DEFAULT_CONNECTION_ID",
  "SPAPI_REGION",
  "SPAPI_LWA_CLIENT_ID",
  "SPAPI_LWA_CLIENT_SECRET",
  "SPAPI_LWA_REFRESH_TOKEN",
  "SPAPI_LWA_REFRESH_TOKEN_UK",
  "SPAPI_AWS_ACCESS_KEY_ID",
  "SPAPI_AWS_SECRET_ACCESS_KEY",
];

function withEnv(env: Record<string, string | undefined>, run: () => void) {
  const previous = new Map<string, string | undefined>();
  for (const key of managedEnvKeys) {
    previous.set(key, process.env[key]);
    delete process.env[key];
  }
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined) process.env[key] = value;
  }
  try {
    run();
  } finally {
    for (const key of managedEnvKeys) {
      const value = previous.get(key);
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

function baseEnv(): Record<string, string> {
  return {
    SPAPI_REGION: "NA",
    SPAPI_LWA_CLIENT_ID: "client-id",
    SPAPI_LWA_CLIENT_SECRET: "client-secret",
    SPAPI_AWS_ACCESS_KEY_ID: "aws-key",
    SPAPI_AWS_SECRET_ACCESS_KEY: "aws-secret",
  };
}

test("Hermes validates the global refresh token when any mapped connection relies on it", () => {
  withEnv(
    {
      ...baseEnv(),
      HERMES_CONNECTIONS_JSON: JSON.stringify([
        { connectionId: "conn_01", marketplaceIds: ["ATVPDKIKX0DER"], region: "NA" },
        {
          connectionId: "conn_01_uk",
          marketplaceIds: ["A1F83G8C2ARO7P"],
          region: "EU",
          lwaRefreshTokenEnv: "SPAPI_LWA_REFRESH_TOKEN_UK",
        },
      ]),
      SPAPI_LWA_REFRESH_TOKEN_UK: "uk-token",
    },
    () => {
      assert.throws(
        () => assertSpApiEnvConfiguredForHermes(),
        /SPAPI_LWA_REFRESH_TOKEN/
      );
    }
  );
});

test("Hermes resolves per-connection refresh tokens from env names", () => {
  withEnv(
    {
      ...baseEnv(),
      HERMES_CONNECTIONS_JSON: JSON.stringify([
        { connectionId: "conn_01", marketplaceIds: ["ATVPDKIKX0DER"], region: "NA" },
        {
          connectionId: "conn_01_uk",
          marketplaceIds: ["A1F83G8C2ARO7P"],
          region: "EU",
          lwaRefreshTokenEnv: "SPAPI_LWA_REFRESH_TOKEN_UK",
        },
      ]),
      SPAPI_LWA_REFRESH_TOKEN: "us-token",
      SPAPI_LWA_REFRESH_TOKEN_UK: "uk-token",
    },
    () => {
      assertSpApiEnvConfiguredForHermes();
      assert.equal(loadSpApiConfigForConnection("conn_01").lwaRefreshToken, "us-token");
      assert.equal(loadSpApiConfigForConnection("conn_01_uk").lwaRefreshToken, "uk-token");
    }
  );
});

test("Hermes rejects ambiguous mapped refresh token configuration", () => {
  withEnv(
    {
      ...baseEnv(),
      HERMES_CONNECTIONS_JSON: JSON.stringify([
        {
          connectionId: "conn_01_uk",
          marketplaceIds: ["A1F83G8C2ARO7P"],
          region: "EU",
          lwaRefreshToken: "inline-token",
          lwaRefreshTokenEnv: "SPAPI_LWA_REFRESH_TOKEN_UK",
        },
      ]),
      SPAPI_LWA_REFRESH_TOKEN: "us-token",
      SPAPI_LWA_REFRESH_TOKEN_UK: "uk-token",
    },
    () => {
      assert.throws(
        () => assertSpApiEnvConfiguredForHermes(),
        /cannot set both lwaRefreshToken and lwaRefreshTokenEnv/
      );
    }
  );
});
