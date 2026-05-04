import assert from "node:assert/strict";
import test from "node:test";

import { getBackfillReviewRequestSupport } from "./backfill-marketplaces";

test("getBackfillReviewRequestSupport keeps UK review requests enabled when US is also configured", () => {
  const support = getBackfillReviewRequestSupport({
    marketplaceIds: ["ATVPDKIKX0DER", "A1F83G8C2ARO7P"],
  });

  assert.equal(support.reviewRequestsEnabled, true);
  assert.deepEqual(support.marketplaceIds, ["ATVPDKIKX0DER", "A1F83G8C2ARO7P"]);
  assert.deepEqual(support.enabledMarketplaceIds, ["A1F83G8C2ARO7P"]);
  assert.deepEqual(support.disabledMarketplaceIds, ["ATVPDKIKX0DER"]);
});

test("getBackfillReviewRequestSupport disables review requests when only US is configured", () => {
  const support = getBackfillReviewRequestSupport({
    marketplaceIds: ["ATVPDKIKX0DER"],
  });

  assert.equal(support.reviewRequestsEnabled, false);
  assert.deepEqual(support.marketplaceIds, ["ATVPDKIKX0DER"]);
  assert.deepEqual(support.enabledMarketplaceIds, []);
  assert.deepEqual(support.disabledMarketplaceIds, ["ATVPDKIKX0DER"]);
});
