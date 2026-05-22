-- AddColumn: subtotal, taxPercentage, taxAmount to Invoice
-- All three are nullable so existing invoices without GST are unaffected.

ALTER TABLE "Invoice" ADD COLUMN "subtotal"      DECIMAL(15,2);
ALTER TABLE "Invoice" ADD COLUMN "taxPercentage" DECIMAL(5,2);
ALTER TABLE "Invoice" ADD COLUMN "taxAmount"     DECIMAL(15,2);
