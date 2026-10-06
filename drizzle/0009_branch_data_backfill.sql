INSERT OR IGNORE INTO clinic_branches (id,clinic_id,name,address,phone,status,is_default)
SELECT id,id,'الفرع الرئيسي','','','active',1 FROM clinics;
--> statement-breakpoint
UPDATE clinic_records SET branch_id=clinic_id WHERE branch_id IS NULL;
--> statement-breakpoint
UPDATE appointments SET branch_id=clinic_id WHERE branch_id IS NULL;
--> statement-breakpoint
UPDATE invoices SET branch_id=clinic_id WHERE branch_id IS NULL;
--> statement-breakpoint
UPDATE invoice_payments SET branch_id=clinic_id WHERE branch_id IS NULL;
--> statement-breakpoint
UPDATE stock_items SET branch_id=clinic_id WHERE branch_id IS NULL;
--> statement-breakpoint
UPDATE stock_movements SET branch_id=clinic_id WHERE branch_id IS NULL;
--> statement-breakpoint
UPDATE medical_files SET branch_id=clinic_id WHERE branch_id IS NULL;
--> statement-breakpoint
UPDATE audit_logs SET branch_id=clinic_id WHERE clinic_id IS NOT NULL AND branch_id IS NULL;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS clinic_records_branch_module_idx ON clinic_records (clinic_id,branch_id,module,created_at);
