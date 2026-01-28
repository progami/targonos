export type SpApiRegion = "NA" | "EU" | "FE";

// Official base hosts per region (production).
// If you need Sandbox, set `sandbox: true` in config (host becomes `sandbox.<base>`).
export const SPAPI_HOST_BY_REGION: Record<SpApiRegion, string> = {
  NA: "sellingpartnerapi-na.amazon.com",
  EU: "sellingpartnerapi-eu.amazon.com",
  FE: "sellingpartnerapi-fe.amazon.com",
};

// AWS signing regions for SP-API endpoints.
// These are the canonical regions used for SigV4 signing (service = execute-api).
export const AWS_REGION_BY_SPAPI_REGION: Record<SpApiRegion, string> = {
  NA: "us-east-1",
  EU: "eu-west-1",
  FE: "us-west-2",
};

export function getSpApiHost(params: {
  region: SpApiRegion;
  sandbox?: boolean;
  endpointOverride?: string;
}): string {
  if (params.endpointOverride) return params.endpointOverride;
  const base = SPAPI_HOST_BY_REGION[params.region];
  if (params.sandbox) return `sandbox.${base}`;
  return base;
}

export function getAwsSigningRegion(params: {
  region: SpApiRegion;
  awsRegionOverride?: string;
}): string {
  return params.awsRegionOverride ?? AWS_REGION_BY_SPAPI_REGION[params.region];
}
