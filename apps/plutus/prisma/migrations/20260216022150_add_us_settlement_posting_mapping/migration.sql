-- AlterTable
ALTER TABLE "SetupConfig" ADD COLUMN     "usSettlementAccountIdByMemo" JSONB,
ADD COLUMN     "usSettlementBankAccountId" TEXT,
ADD COLUMN     "usSettlementPaymentAccountId" TEXT;
