-- Settlement cash legs always post through Plutus Settlement Control.
ALTER TABLE "SettlementPostingConfig"
DROP COLUMN IF EXISTS "bankAccountId",
DROP COLUMN IF EXISTS "paymentAccountId";
