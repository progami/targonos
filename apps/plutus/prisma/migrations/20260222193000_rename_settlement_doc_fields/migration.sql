-- Rename legacy columns to settlement-native names.
ALTER TABLE "SettlementProcessing" RENAME COLUMN "lmbDocNumber" TO "settlementDocNumber";
ALTER TABLE "SettlementProcessing" RENAME COLUMN "lmbPostedDate" TO "settlementPostedDate";

ALTER TABLE "SettlementRollback" RENAME COLUMN "lmbDocNumber" TO "settlementDocNumber";
ALTER TABLE "SettlementRollback" RENAME COLUMN "lmbPostedDate" TO "settlementPostedDate";
