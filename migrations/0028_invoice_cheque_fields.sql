-- 0028: cheque (chèque) support on center invoices
--
-- A cheque is recorded on a pending invoice (payment_method='cheque' plus the
-- number/date below). Such invoices stay OUT of revenue until the cheque is
-- encashed, i.e. until the invoice status becomes 'paid' (payment_date set).

ALTER TABLE center_invoices ADD COLUMN cheque_number TEXT;
ALTER TABLE center_invoices ADD COLUMN cheque_date INTEGER;
