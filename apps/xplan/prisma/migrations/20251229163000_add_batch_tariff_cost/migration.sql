-- Add optional per-unit tariff override for batch rows (Tariff $ mode)
ALTER TABLE "BatchTableRow" ADD COLUMN "overrideTariffCost" DECIMAL(10,3);

