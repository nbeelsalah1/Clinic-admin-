import { sql } from "drizzle-orm";
import { index, integer, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";

// Only opaque references and check statuses are retained; identity evidence stays at Didit.
export const verificationSettings = sqliteTable("verification_settings", {
  provider: text("provider").primaryKey(),
  apiKeyEnc: text("api_key_enc").notNull(),
  workflowId: text("workflow_id").notNull(),
  environment: text("environment", { enum: ["sandbox", "live"] }).notNull(),
  revision: text("revision").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const identityVerifications = sqliteTable("identity_verifications", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull(),
  sessionId: text("session_id").notNull(),
  sessionUrlEnc: text("session_url_enc").notNull(),
  configRevision: text("config_revision").notNull(),
  environment: text("environment", { enum: ["sandbox", "live"] }).notNull(),
  status: text("status").notNull().default("Not Started"),
  documentStatus: text("document_status").notNull().default("Not Started"),
  phoneStatus: text("phone_status").notNull().default("Not Started"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("verification_session_uq").on(table.sessionId), index("verification_user_date_idx").on(table.userId, table.createdAt)]);

export const verificationLimits = sqliteTable("verification_limits", {
  bucket: text("bucket").primaryKey(),
  count: integer("count").notNull().default(0),
  lastAt: integer("last_at").notNull(),
});

export const emailSettings = sqliteTable("email_settings", {
  provider: text("provider").primaryKey(), apiKeyEnc: text("api_key_enc").notNull(),
  fromEmail: text("from_email").notNull(), replyTo: text("reply_to").notNull(),
  enabled: integer("enabled", { mode: "boolean" }).notNull().default(false),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});
export const emailOutbox = sqliteTable("email_outbox", {
  id: text("id").primaryKey(), eventKey: text("event_key").notNull(), kind: text("kind").notNull(),
  recipientEnc: text("recipient_enc").notNull(), payloadEnc: text("payload_enc"), requestEnc: text("request_enc"),
  status: text("status").notNull().default("queued"), attempts: integer("attempts").notNull().default(0),
  providerId: text("provider_id"), errorCode: text("error_code"), firstAttemptAt: integer("first_attempt_at"),
  nextAttemptAt: integer("next_attempt_at").notNull().default(0), lockedAt: integer("locked_at"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`), acceptedAt: text("accepted_at"),
}, t=>[uniqueIndex("outbox_event_uq").on(t.eventKey),index("outbox_status_idx").on(t.status,t.nextAttemptAt)]);
export const trialRequests = sqliteTable("trial_requests", {
  id: text("id").primaryKey(), userId: text("user_id").notNull(), emailHash: text("email_hash").notNull(),
  emailEnc: text("email_enc").notNull(), clinicName: text("clinic_name").notNull(), language: text("language").notNull().default("ar"),
  status: text("status").notNull().default("pending"), clinicId: text("clinic_id"), startsAt: text("starts_at"), endsAt: text("ends_at"),
  reviewedBy: text("reviewed_by"), createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex("trial_user_uq").on(t.userId),uniqueIndex("trial_email_uq").on(t.emailHash),index("trial_status_idx").on(t.status,t.createdAt)]);

export const platformUsers = sqliteTable("platform_users", {
  userId: text("user_id").primaryKey(),
  email: text("email").notNull(),
  role: text("role", { enum: ["super_admin"] }).notNull().default("super_admin"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const clinics = sqliteTable("clinics", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  ownerUserId: text("owner_user_id").notNull(),
  licenseId: text("license_id"),
  trialEndsAt: text("trial_ends_at"),
  primarySpecialty: text("primary_specialty").notNull().default("general"),
  enabledSpecialties: text("enabled_specialties").notNull().default('["general","dental","obstetrics","pediatrics","dermatology","physiotherapy","ophthalmology"]'),
  publicSlug: text("public_slug"),
  publicDescription: text("public_description").notNull().default(""),
  publicSeoTitle: text("public_seo_title").notNull().default(""),
  publicSeoDescription: text("public_seo_description").notNull().default(""),
  publicPhone: text("public_phone").notNull().default(""),
  publicAddress: text("public_address").notNull().default(""),
  publicBookingUrl: text("public_booking_url").notNull().default(""),
  publicEnabled: integer("public_enabled", { mode: "boolean" }).notNull().default(false),
  contactPhone: text("contact_phone").notNull().default(""),
  contactEmail: text("contact_email").notNull().default(""),
  contactAddress: text("contact_address").notNull().default(""),
  defaultAppointmentMinutes: integer("default_appointment_minutes").notNull().default(20),
  invoicePrefix: text("invoice_prefix").notNull().default("INV"),
  invoiceFooter: text("invoice_footer").notNull().default(""),
  defaultTaxBps: integer("default_tax_bps").notNull().default(0),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("clinics_owner_user_uq").on(table.ownerUserId), uniqueIndex("clinics_license_uq").on(table.licenseId), uniqueIndex("clinics_public_slug_uq").on(table.publicSlug).where(sql`${table.publicSlug} IS NOT NULL`)]);


export const memberships = sqliteTable("clinic_memberships", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id),
  userId: text("user_id").notNull(),
  email: text("email").notNull(),
  role: text("role", { enum: ["clinic_admin", "doctor", "nurse", "receptionist", "accountant"] }).notNull(),
  active: integer("active", { mode: "boolean" }).notNull().default(true),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [uniqueIndex("memberships_clinic_user_uq").on(table.clinicId, table.userId), index("memberships_user_idx").on(table.userId), uniqueIndex("memberships_clinic_email_uq").on(table.clinicId,sql`lower(${table.email})`)]);

export const patients = sqliteTable("patients", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id),
  fullNameEnc: text("full_name_enc").notNull(),
  identityNumberEnc: text("identity_number_enc"),
  phoneEnc: text("phone_enc").notNull(),
  emailEnc: text("email_enc"),
  addressEnc: text("address_enc"),
  gender: text("gender"),
  birthDate: text("birth_date"),
  historyEnc: text("history_enc"),
  allergiesEnc: text("allergies_enc"),
  medicationsEnc: text("medications_enc"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("patients_clinic_date_idx").on(table.clinicId, table.createdAt)]);

export const appointments = sqliteTable("appointments", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id),
  branchId: text("branch_id"),
  patientId: text("patient_id").references(() => patients.id),
  doctorId: text("doctor_id"),
  patientNameEnc: text("patient_name_enc").notNull(),
  service: text("service").notNull(),
  doctorName: text("doctor_name").notNull(),
  startsAt: text("starts_at").notNull(),
  durationMinutes: integer("duration_minutes").notNull().default(20),
  status: text("status", { enum: ["upcoming", "waiting", "completed", "cancelled", "no_show"] }).notNull().default("upcoming"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("appointments_clinic_start_idx").on(table.clinicId, table.startsAt)]);

export const subscriptions = sqliteTable("subscriptions", {
  id: text("id").primaryKey(),
  clinicName: text("clinic_name").notNull(),
  contactEmail: text("contact_email").notNull(),
  language: text("language").notNull().default("ar"),
  plan: text("plan", { enum: ["starter", "professional", "business", "medical_center", "enterprise"] }).notNull(),
  term: text("term", { enum: ["monthly", "annual"] }).notNull(),
  amountIls: integer("amount_ils").notNull(),
  paidAmountIls: integer("paid_amount_ils"),
  paymentStatus: text("payment_status", { enum: ["pending", "paid", "refunded"] }).notNull().default("pending"),
  paymentReference: text("payment_reference"),
  paidAt: text("paid_at"),
  createdBy: text("created_by").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("subscriptions_status_date_idx").on(table.paymentStatus, table.createdAt)]);

export const qreditSubscriptionPayments = sqliteTable("qredit_subscription_payments", {
  id:text("id").primaryKey(),subscriptionId:text("subscription_id").notNull().references(()=>subscriptions.id),userId:text("user_id").notNull(),clientReference:text("client_reference").notNull(),orderReference:text("order_reference"),paymentReference:text("payment_reference"),checkoutUrl:text("checkout_url"),amountIls:integer("amount_ils").notNull(),status:text("status").notNull().default("creating"),providerStatus:text("provider_status"),createdAt:text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),paidAt:text("paid_at"),
},t=>[uniqueIndex("qredit_sub_client_ref_uq").on(t.clientReference),uniqueIndex("qredit_sub_payment_ref_uq").on(t.paymentReference),uniqueIndex("qredit_sub_order_ref_uq").on(t.orderReference),index("qredit_sub_owner_date_idx").on(t.userId,t.createdAt)]);

export const licenses = sqliteTable("licenses", {
  id: text("id").primaryKey(),
  subscriptionId: text("subscription_id").notNull().references(() => subscriptions.id),
  keyHash: text("key_hash").notNull(),
  keyHint: text("key_hint").notNull(),
  status: text("status", { enum: ["issued", "active", "suspended", "expired"] }).notNull().default("issued"),
  clinicId: text("clinic_id").references(() => clinics.id),
  issuedAt: text("issued_at").notNull().default(sql`CURRENT_TIMESTAMP`),
  expiresAt: text("expires_at").notNull(),
  activatedAt: text("activated_at"),
}, (table) => [uniqueIndex("licenses_hash_uq").on(table.keyHash), uniqueIndex("licenses_subscription_uq").on(table.subscriptionId)]);

export const smsSettings = sqliteTable("sms_settings", {
  clinicId: text("clinic_id").primaryKey().references(() => clinics.id),
  gatewayUrl: text("gateway_url").notNull(),
  senderId: text("sender_id").notNull(),
  tokenCiphertext: text("token_ciphertext").notNull(),
  updatedAt: text("updated_at").notNull().default(sql`CURRENT_TIMESTAMP`),
});

export const smsLogs = sqliteTable("sms_logs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").notNull().references(() => clinics.id),
  recipientCiphertext: text("recipient_ciphertext").notNull(),
  status: text("status", { enum: ["sent", "failed"] }).notNull(),
  providerMessageId: text("provider_message_id"),
  errorCode: text("error_code"),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("sms_logs_clinic_date_idx").on(table.clinicId, table.createdAt)]);

export const auditLogs = sqliteTable("audit_logs", {
  id: text("id").primaryKey(),
  clinicId: text("clinic_id").references(() => clinics.id),
  branchId: text("branch_id"),
  actorUserId: text("actor_user_id").notNull(),
  action: text("action").notNull(),
  resourceType: text("resource_type").notNull(),
  resourceId: text("resource_id").notNull(),
  createdAt: text("created_at").notNull().default(sql`CURRENT_TIMESTAMP`),
}, (table) => [index("audit_logs_clinic_date_idx").on(table.clinicId, table.createdAt), index("audit_logs_branch_date_idx").on(table.clinicId,table.branchId,table.createdAt), index("audit_logs_actor_date_idx").on(table.actorUserId, table.createdAt)]);

export const clinicRecords = sqliteTable('clinic_records', {
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id'),
 module:text('module').notNull(),patientId:text('patient_id').references(()=>patients.id),
 dataEnc:text('data_enc').notNull(),version:integer('version').notNull().default(1),
 createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[index('records_clinic_module_idx').on(t.clinicId,t.module),index('records_patient_idx').on(t.clinicId,t.patientId)]);
export const invoices = sqliteTable('invoices', {
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id'),patientId:text('patient_id').notNull().references(()=>patients.id),
 number:text('number').notNull(),dataEnc:text('data_enc').notNull(),subtotal:integer('subtotal').notNull(),tax:integer('tax').notNull(),total:integer('total').notNull(),paid:integer('paid').notNull().default(0),
 status:text('status').notNull().default('issued'),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('invoice_number_uq').on(t.clinicId,t.number),index('invoice_clinic_idx').on(t.clinicId,t.createdAt)]);
export const invoicePayments=sqliteTable('invoice_payments',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id'),invoiceId:text('invoice_id').notNull().references(()=>invoices.id),
 amount:integer('amount').notNull(),method:text('method').notNull(),requestKey:text('request_key').notNull(),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('payment_request_uq').on(t.clinicId,t.requestKey),index('payment_invoice_idx').on(t.clinicId,t.invoiceId)]);
export const stockItems=sqliteTable('stock_items',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id'),name:text('name').notNull(),batch:text('batch').notNull(),category:text('category').notNull().default('supply'),
 quantity:integer('quantity').notNull().default(0),threshold:integer('threshold').notNull().default(5),expires:text('expires'),supplierId:text('supplier_id'),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[index('stock_clinic_idx').on(t.clinicId)]);
export const stockMovements=sqliteTable('stock_movements',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id'),itemId:text('item_id').notNull().references(()=>stockItems.id),delta:integer('delta').notNull(),reason:text('reason').notNull(),requestKey:text('request_key').notNull(),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('stock_request_uq').on(t.clinicId,t.requestKey)]);
export const medicalFiles=sqliteTable('medical_files',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id'),patientId:text('patient_id').notNull().references(()=>patients.id),
 nameEnc:text('name_enc').notNull(),mime:text('mime').notNull(),size:integer('size').notNull(),objectKey:text('object_key').notNull(),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[index('files_clinic_patient_idx').on(t.clinicId,t.patientId)]);

export const clinicBranches=sqliteTable('clinic_branches',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),name:text('name').notNull(),address:text('address').notNull().default(''),phone:text('phone').notNull().default(''),status:text('status').notNull().default('active'),isDefault:integer('is_default',{mode:'boolean'}).notNull().default(false),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('branch_name_uq').on(t.clinicId,t.name),index('branch_clinic_active_idx').on(t.clinicId,t.status)]);
export const clinicBranchMemberships=sqliteTable('clinic_branch_memberships',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id').notNull().references(()=>clinicBranches.id),userId:text('user_id').notNull(),email:text('email').notNull(),active:integer('active',{mode:'boolean'}).notNull().default(true),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('branch_member_uq').on(t.clinicId,t.branchId,t.userId),index('branch_member_user_idx').on(t.clinicId,t.userId,t.active)]);
export const qreditPayments=sqliteTable('qredit_payments',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),branchId:text('branch_id'),invoiceId:text('invoice_id').notNull().references(()=>invoices.id),clientReference:text('client_reference').notNull(),orderReference:text('order_reference'),paymentReference:text('payment_reference'),checkoutUrl:text('checkout_url'),amount:integer('amount').notNull(),currency:text('currency').notNull().default('ILS'),status:text('status').notNull().default('creating'),providerStatus:text('provider_status'),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),updatedAt:text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),paidAt:text('paid_at'),
},t=>[uniqueIndex('qredit_client_ref_uq').on(t.clientReference),uniqueIndex('qredit_payment_ref_uq').on(t.paymentReference),uniqueIndex('qredit_order_ref_uq').on(t.orderReference),uniqueIndex('qredit_active_invoice_uq').on(t.clinicId,t.branchId,t.invoiceId).where(sql`status IN ('creating','pending')`),index('qredit_invoice_idx').on(t.clinicId,t.branchId,t.invoiceId,t.status)]);

export const patientPortalAccess = sqliteTable('patient_portal_access',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),patientId:text('patient_id').notNull().references(()=>patients.id),emailHash:text('email_hash').notNull(),active:integer('active').notNull().default(1),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('portal_patient_uq').on(t.clinicId,t.patientId),index('portal_email_idx').on(t.emailHash,t.active)]);
export const publicBookingRequests = sqliteTable('public_booking_requests',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),userId:text('user_id').notNull(),emailHash:text('email_hash').notNull(),dataEnc:text('data_enc').notNull(),status:text('status').notNull().default('pending'),requestKey:text('request_key').notNull(),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('booking_request_key_uq').on(t.userId,t.requestKey),index('booking_clinic_status_idx').on(t.clinicId,t.status,t.createdAt)]);
export const clinicIntegrations = sqliteTable('clinic_integrations',{
 clinicId:text('clinic_id').primaryKey().references(()=>clinics.id),whatsappPhoneId:text('whatsapp_phone_id'),whatsappTokenEnc:text('whatsapp_token_enc'),whatsappAppSecretEnc:text('whatsapp_app_secret_enc'),verifyTokenHash:text('verify_token_hash'),apiKeyHash:text('api_key_hash'),apiEnabled:integer('api_enabled').notNull().default(0),whatsappEnabled:integer('whatsapp_enabled').notNull().default(0),updatedAt:text('updated_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('whatsapp_phone_id_uq').on(t.whatsappPhoneId)]);
export const workflowLimits = sqliteTable('workflow_limits',{
 bucket:text('bucket').primaryKey(),count:integer('count').notNull().default(0),
});
export const whatsappEvents=sqliteTable('whatsapp_events',{
 id:text('id').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),senderHash:text('sender_hash').notNull(),status:text('status').notNull().default('received'),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[index('whatsapp_clinic_idx').on(t.clinicId,t.createdAt)]);
export const labSamples=sqliteTable('lab_samples',{
 code:text('code').primaryKey(),clinicId:text('clinic_id').notNull().references(()=>clinics.id),recordId:text('record_id').notNull(),createdAt:text('created_at').notNull().default(sql`CURRENT_TIMESTAMP`),
},t=>[uniqueIndex('lab_record_uq').on(t.clinicId,t.recordId)]);
