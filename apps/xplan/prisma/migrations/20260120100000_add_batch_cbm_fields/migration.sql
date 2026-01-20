-- Add carton dimension fields for CBM calculation on batch rows
ALTER TABLE "BatchTableRow" ADD COLUMN "cartonSide1Cm" DECIMAL(8,2);
ALTER TABLE "BatchTableRow" ADD COLUMN "cartonSide2Cm" DECIMAL(8,2);
ALTER TABLE "BatchTableRow" ADD COLUMN "cartonSide3Cm" DECIMAL(8,2);
ALTER TABLE "BatchTableRow" ADD COLUMN "cartonWeightKg" DECIMAL(8,3);
ALTER TABLE "BatchTableRow" ADD COLUMN "unitsPerCarton" INTEGER;
