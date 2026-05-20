-- Decimal Migration: Float → Decimal(15,2) for all monetary fields
-- Applied via prisma db push on 2026-05-20
-- This migration records the schema change in migration history.

-- Revenue.amount
ALTER TABLE "Revenue" ALTER COLUMN "amount" TYPE DECIMAL(15,2) USING "amount"::DECIMAL(15,2);

-- Expense.amount
ALTER TABLE "Expense" ALTER COLUMN "amount" TYPE DECIMAL(15,2) USING "amount"::DECIMAL(15,2);

-- LedgerEntry.amount
ALTER TABLE "LedgerEntry" ALTER COLUMN "amount" TYPE DECIMAL(15,2) USING "amount"::DECIMAL(15,2);

-- Invoice.totalAmount
ALTER TABLE "Invoice" ALTER COLUMN "totalAmount" TYPE DECIMAL(15,2) USING "totalAmount"::DECIMAL(15,2);

-- InvoiceItem.quantity
ALTER TABLE "InvoiceItem" ALTER COLUMN "quantity" TYPE DECIMAL(15,2) USING "quantity"::DECIMAL(15,2);

-- InvoiceItem.unitPrice
ALTER TABLE "InvoiceItem" ALTER COLUMN "unitPrice" TYPE DECIMAL(15,2) USING "unitPrice"::DECIMAL(15,2);

-- InvoiceItem.total
ALTER TABLE "InvoiceItem" ALTER COLUMN "total" TYPE DECIMAL(15,2) USING "total"::DECIMAL(15,2);

-- ProjectFinance.totalIncome
ALTER TABLE "ProjectFinance" ALTER COLUMN "totalIncome" TYPE DECIMAL(15,2) USING "totalIncome"::DECIMAL(15,2);

-- ProjectFinance.totalExpense
ALTER TABLE "ProjectFinance" ALTER COLUMN "totalExpense" TYPE DECIMAL(15,2) USING "totalExpense"::DECIMAL(15,2);
