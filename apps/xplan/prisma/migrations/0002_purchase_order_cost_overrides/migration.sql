ALTER TABLE "PurchaseOrder"
  ADD COLUMN "overrideSellingPrice" DECIMAL(10,2),
  ADD COLUMN "overrideManufacturingCost" DECIMAL(10,2),
  ADD COLUMN "overrideFreightCost" DECIMAL(10,2),
  ADD COLUMN "overrideTariffRate" DECIMAL(5,4),
  ADD COLUMN "overrideTacosPercent" DECIMAL(5,4),
  ADD COLUMN "overrideFbaFee" DECIMAL(10,2),
  ADD COLUMN "overrideReferralRate" DECIMAL(5,4),
  ADD COLUMN "overrideStoragePerMonth" DECIMAL(10,2);
