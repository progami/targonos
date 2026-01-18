ALTER TABLE "Product"
  ALTER COLUMN "manufacturingCost" TYPE DECIMAL(10,3),
  ALTER COLUMN "freightCost" TYPE DECIMAL(10,3),
  ALTER COLUMN "fbaFee" TYPE DECIMAL(10,3),
  ALTER COLUMN "storagePerMonth" TYPE DECIMAL(10,3);

ALTER TABLE "PurchaseOrder"
  ALTER COLUMN "overrideManufacturingCost" TYPE DECIMAL(10,3),
  ALTER COLUMN "overrideFreightCost" TYPE DECIMAL(10,3),
  ALTER COLUMN "overrideFbaFee" TYPE DECIMAL(10,3),
  ALTER COLUMN "overrideStoragePerMonth" TYPE DECIMAL(10,3);

ALTER TABLE "BatchTableRow"
  ALTER COLUMN "overrideManufacturingCost" TYPE DECIMAL(10,3),
  ALTER COLUMN "overrideFreightCost" TYPE DECIMAL(10,3),
  ALTER COLUMN "overrideFbaFee" TYPE DECIMAL(10,3),
  ALTER COLUMN "overrideStoragePerMonth" TYPE DECIMAL(10,3);
