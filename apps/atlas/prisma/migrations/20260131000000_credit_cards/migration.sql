-- CreateEnum
CREATE TYPE "CreditCardBrand" AS ENUM ('VISA', 'MASTERCARD', 'AMEX', 'DISCOVER', 'OTHER');

-- CreateTable
CREATE TABLE "CreditCard" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "cardholderName" TEXT,
    "brand" "CreditCardBrand" NOT NULL,
    "last4" TEXT NOT NULL,
    "expMonth" INTEGER NOT NULL,
    "expYear" INTEGER NOT NULL,
    "department" "PasswordDepartment" NOT NULL DEFAULT 'FINANCE',
    "url" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditCard_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CreditCard_department_idx" ON "CreditCard"("department");

-- CreateIndex
CREATE INDEX "CreditCard_title_idx" ON "CreditCard"("title");

-- CreateIndex
CREATE INDEX "CreditCard_last4_idx" ON "CreditCard"("last4");

