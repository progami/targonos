-- AlterTable
ALTER TABLE "CashflowForecastConfig" ADD COLUMN     "autoRefreshEnabled" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "autoRefreshMinSnapshotAgeMinutes" INTEGER NOT NULL DEFAULT 720,
ADD COLUMN     "autoRefreshTimeLocal" TEXT NOT NULL DEFAULT '06:00';
