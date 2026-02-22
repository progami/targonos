-- CreateTable
CREATE TABLE IF NOT EXISTS "SettlementPostingConfig" (
    "id" TEXT NOT NULL,
    "marketplace" TEXT NOT NULL,
    "bankAccountId" TEXT,
    "paymentAccountId" TEXT,
    "accountIdByMemo" JSONB NOT NULL,
    "taxCodeIdByMemo" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SettlementPostingConfig_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SettlementPostingConfig_marketplace_key" ON "SettlementPostingConfig"("marketplace");
CREATE INDEX IF NOT EXISTS "SettlementPostingConfig_marketplace_idx" ON "SettlementPostingConfig"("marketplace");

-- AlterTable
ALTER TABLE "SettlementPostingConfig" ADD COLUMN IF NOT EXISTS "taxCodeIdByMemo" JSONB;

