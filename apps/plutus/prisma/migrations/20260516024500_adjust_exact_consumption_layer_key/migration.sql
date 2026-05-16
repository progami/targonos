ALTER TABLE "CostLayerConsumption" DROP CONSTRAINT "CostLayerConsumption_poCostLayerId_fkey";
DROP INDEX "CostLayerConsumption_cogsPostingBatchId_poCostLayerId_sellerSku_key";

ALTER TABLE "CostLayerConsumption" ADD COLUMN "internalPo" TEXT NOT NULL;
ALTER TABLE "CostLayerConsumption" ALTER COLUMN "poCostLayerId" DROP NOT NULL;

CREATE UNIQUE INDEX "CostLayerConsumption_cogsPostingBatchId_internalPo_sellerSku_key" ON "CostLayerConsumption"("cogsPostingBatchId", "internalPo", "sellerSku");
CREATE INDEX "CostLayerConsumption_internalPo_idx" ON "CostLayerConsumption"("internalPo");

ALTER TABLE "CostLayerConsumption" ADD CONSTRAINT "CostLayerConsumption_poCostLayerId_fkey" FOREIGN KEY ("poCostLayerId") REFERENCES "PoCostLayer"("id") ON DELETE SET NULL ON UPDATE CASCADE;
