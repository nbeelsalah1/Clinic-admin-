import { z } from "zod";
import {specialtyKeys} from "../../../lib/ops-model";
import { currentClinicContext, isClinicContext } from "../../../lib/clinic-runtime";

const reply = (body: unknown, status = 200) => Response.json(body, { status, headers: { "Cache-Control": "no-store" } });

export async function GET(request: Request) {
  const context = await currentClinicContext(request);
  if (!isClinicContext(context)) return context;
  try {
    const row = await context.db.prepare(
      "SELECT primary_specialty,enabled_specialties,name,contact_phone,contact_email,contact_address,default_appointment_minutes,invoice_prefix,invoice_footer,default_tax_bps FROM clinics WHERE id = ?",
    ).bind(context.clinicId).first<Record<string, string | number>>();
    if (!row) return reply({ error: "Clinic settings were not found." }, 404);
    return reply({ settings: {
      name: row.name,
      primarySpecialty:row.primary_specialty,
      enabledSpecialties:JSON.parse(String(row.enabled_specialties)),
      contactPhone: row.contact_phone,
      contactEmail: row.contact_email,
      contactAddress: row.contact_address,
      defaultAppointmentMinutes: row.default_appointment_minutes,
      invoicePrefix: row.invoice_prefix,
      invoiceFooter: row.invoice_footer,
      defaultTaxBps: row.default_tax_bps,
    } });
  } catch {
    return reply({ error: "Could not load clinic settings. Apply the latest database migration." }, 503);
  }
}

const settingsSchema = z.object({
  primarySpecialty:z.enum(specialtyKeys).default("general"),
  enabledSpecialties:z.array(z.enum(specialtyKeys)).min(1).max(7).refine(v=>new Set(v).size===v.length).default([...specialtyKeys]),
  name: z.string().trim().min(2).max(160),
  contactPhone: z.string().trim().max(40),
  contactEmail: z.union([z.literal(""), z.string().trim().email().max(254)]),
  contactAddress: z.string().trim().max(300),
  defaultAppointmentMinutes: z.number().int().min(5).max(480),
  invoicePrefix: z.string().trim().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,9}$/).transform((value) => value.toUpperCase()),
  invoiceFooter: z.string().trim().max(500),
  defaultTaxBps: z.number().int().min(0).max(10000),
}).strict().refine(v=>v.enabledSpecialties.includes(v.primarySpecialty),{message:"Primary specialty must be enabled",path:["primarySpecialty"]});

export async function PATCH(request: Request) {
  const context = await currentClinicContext(request);
  if (!isClinicContext(context)) return context;
  if (context.role !== "clinic_admin") return reply({ error: "Clinic administrator access is required." }, 403);
  try {
    const settings = settingsSchema.parse(await request.json());
    await context.db.batch([
      context.db.prepare(
        "UPDATE clinics SET name=?,contact_phone=?,contact_email=?,contact_address=?,default_appointment_minutes=?,invoice_prefix=?,invoice_footer=?,default_tax_bps=?,primary_specialty=?,enabled_specialties=? WHERE id=?",
      ).bind(settings.name, settings.contactPhone, settings.contactEmail, settings.contactAddress, settings.defaultAppointmentMinutes, settings.invoicePrefix, settings.invoiceFooter, settings.defaultTaxBps, settings.primarySpecialty,JSON.stringify(settings.enabledSpecialties), context.clinicId),
      context.db.prepare(
        "INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,?,'clinic.settings.updated','settings',?)",
      ).bind(crypto.randomUUID(), context.clinicId, context.branchId, context.user.userId, context.clinicId),
    ]);
    return reply({ ok: true, settings });
  } catch (error) {
    if (error instanceof z.ZodError) return reply({ error: "Check the clinic details and settings." }, 400);
    return reply({ error: "Could not save clinic settings. Apply the latest database migration." }, 503);
  }
}
