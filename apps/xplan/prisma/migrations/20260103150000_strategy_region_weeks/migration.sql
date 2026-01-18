-- CreateEnum
CREATE TYPE "StrategyRegion" AS ENUM ('US', 'UK');

-- AlterTable
ALTER TABLE "Strategy" ADD COLUMN     "region" "StrategyRegion" NOT NULL DEFAULT 'US';

-- AlterTable
ALTER TABLE "PurchaseOrder" ADD COLUMN     "availableWeekNumber" INTEGER,
ADD COLUMN     "inboundEtaWeekNumber" INTEGER,
ADD COLUMN     "poWeekNumber" INTEGER,
ADD COLUMN     "portEtaWeekNumber" INTEGER,
ADD COLUMN     "productionCompleteWeekNumber" INTEGER,
ADD COLUMN     "sourceDepartureWeekNumber" INTEGER;

-- AlterTable
ALTER TABLE "PurchaseOrderPayment" ADD COLUMN     "dueWeekNumber" INTEGER,
ADD COLUMN     "dueWeekNumberDefault" INTEGER;

