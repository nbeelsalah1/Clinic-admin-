import { currentProgramContext, isAccountContext, sha256 } from "../../../../lib/clinic-runtime";
import { mailLanguage } from "@/lib/subscriber-policy";
import { dispatchSubscriberMail, queueSubscriberMail } from "@/lib/subscriber-mail";

const plans = {
  starter: { label: "Starter", monthly: 49, annual: 490 },
  professional: { label: "Professional", monthly: 99, annual: 990 },
  business: { label: "Business", monthly: 179, annual: 1790 },
  medical_center: { label: "Medical Center", monthly: 299, annual: 2990 },
  enterprise: { label: "Enterprise", monthly: 0, annual: 0 },
} as const;
type Plan = keyof typeof plans;

function errorResponse(error: unknown) {
  const message = error instanceof Error ? error.message : "Request failed.";
  return Response.json({ error: message.includes("no such table") ? "License tables are not ready yet." : "Could not process this subscription." }, { status: 503 });
}
async function requireAdmin(request: Request) {
  const context = await currentProgramContext(request);
  if (!isAccountContext(context)) return context;
  if (!context.isSuperAdmin) return Response.json({ error: "Program administration access is required." }, { status: 403 });
  return context;
}

export async function GET(request: Request) {
  try {
    const context = await requireAdmin(request);
    if (!isAccountContext(context)) return context;
    const subscriptions = await context.db.prepare(
      "SELECT s.id, s.clinic_name, s.contact_email, s.plan, s.term, s.amount_ils, s.payment_status, s.payment_reference, s.paid_at, s.created_at, l.status AS license_status, l.key_hint, l.expires_at FROM subscriptions s LEFT JOIN licenses l ON l.subscription_id = s.id ORDER BY s.created_at DESC LIMIT 100",
    ).all();
    return Response.json({ subscriptions: subscriptions.results ?? [], plans });
  } catch (error) { return errorResponse(error); }
}

export async function POST(request: Request) {
  try {
    const context = await requireAdmin(request);
    if (!isAccountContext(context)) return context;
    const body = await request.json() as { clinicName?: string; email?: string; plan?: Plan; term?: "monthly" | "annual"; amountIls?: number; language?: string };
    const clinicName = body.clinicName?.trim().slice(0, 160) ?? "";
    const email = body.email?.trim().slice(0, 254) ?? "";
    const plan = body.plan;
    const term = body.term;
    if (!clinicName || !/^\S+@\S+\.\S+$/.test(email) || !plan || !(plan in plans) || !term || !["monthly", "annual"].includes(term)) {
      return Response.json({ error: "Clinic name, contact email, a valid plan, and billing term are required." }, { status: 400 });
    }
    const defaultAmount = plans[plan][term];
    const amountIls = plan === "enterprise" ? Number(body.amountIls) : defaultAmount;
    if (!Number.isInteger(amountIls) || amountIls < 1 || amountIls > 1000000) return Response.json({ error: "Enter the agreed subscription amount in ILS." }, { status: 400 });
    const id = crypto.randomUUID();
    const language=mailLanguage(body.language);
    const mail=await queueSubscriberMail(context.db,`subscription-created/${id}`,"subscription_created",email,{clinicName,language,amountIls});
    await context.db.batch([context.db.prepare("INSERT INTO subscriptions (id, clinic_name, contact_email, plan, term, amount_ils, created_by, language) VALUES (?, ?, ?, ?, ?, ?, ?, ?)")
      .bind(id, clinicName, email, plan, term, amountIls, context.user.userId,language),mail.statement]);
    await dispatchSubscriberMail(context.db,mail.id);
    return Response.json({ id, paymentStatus: "pending", amountIls, currency: "ILS" }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}

function createLicenseKey() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = crypto.getRandomValues(new Uint8Array(20));
  const raw = Array.from(bytes, (byte) => alphabet[byte & 31]).join("");
  return `AYD-${raw.slice(0,5)}-${raw.slice(5,10)}-${raw.slice(10,15)}-${raw.slice(15,20)}`;
}

export async function PATCH(request: Request) {
  try {
    const context = await requireAdmin(request);
    if (!isAccountContext(context)) return context;
    const body = await request.json() as { id?: string; paymentReference?: string; paidAmount?: number };
    const id = body.id?.trim() ?? "";
    const paymentReference = body.paymentReference?.trim().slice(0, 160) ?? "";
    const paidAmount = Number(body.paidAmount);
    if (!id || !paymentReference || !Number.isInteger(paidAmount) || paidAmount < 1) return Response.json({ error: "Subscription, payment reference, and paid amount are required." }, { status: 400 });
    const subscription = await context.db.prepare("SELECT * FROM subscriptions WHERE id = ? AND payment_status = 'pending'").bind(id).first<{ id: string; plan: Plan; term: "monthly" | "annual"; amount_ils: number; clinic_name:string; contact_email:string; language:string }>();
    if (!subscription) return Response.json({ error: "Pending subscription not found or payment already confirmed." }, { status: 404 });
    if (paidAmount < subscription.amount_ils) return Response.json({ error: "The payment is lower than the subscription amount." }, { status: 400 });

    const code = createLicenseKey();
    const keyHash = await sha256(code);
    const licenseId = crypto.randomUUID();
    const expiresAt = new Date();
    if (subscription.term === "annual") expiresAt.setFullYear(expiresAt.getFullYear() + 1);
    else expiresAt.setMonth(expiresAt.getMonth() + 1);
    const now = new Date().toISOString();
    const mail=await queueSubscriberMail(context.db,`payment-confirmed/${id}`,"payment_confirmed",subscription.contact_email,{clinicName:subscription.clinic_name,language:mailLanguage(subscription.language),amountIls:paidAmount,licenseKey:code,expiresAt:expiresAt.toISOString()});
    await context.db.batch([
      context.db.prepare("UPDATE subscriptions SET payment_status = 'paid', paid_amount_ils = ?, payment_reference = ?, paid_at = ? WHERE id = ? AND payment_status = 'pending'").bind(paidAmount, paymentReference, now, id),
      context.db.prepare("INSERT INTO licenses (id, subscription_id, key_hash, key_hint, status, expires_at) VALUES (?, ?, ?, ?, 'issued', ?)").bind(licenseId, id, keyHash, code.slice(-4), expiresAt.toISOString()),
      context.db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id) VALUES (?, ?, 'subscription.payment_confirmed', 'subscription', ?)").bind(crypto.randomUUID(), context.user.userId, id),
      context.db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id) VALUES (?, ?, 'license.issued', 'license', ?)").bind(crypto.randomUUID(), context.user.userId, licenseId),
      mail.statement,
    ]);
    const emailStatus=await dispatchSubscriberMail(context.db,mail.id);
    return Response.json({ license: { id: licenseId, key: code, keyHint: code.slice(-4), expiresAt: expiresAt.toISOString(), status: "issued" }, emailStatus, notice: "This key is shown once. An encrypted email notice is queued for the clinic contact; check email administration for its sending status." }, { status: 201 });
  } catch (error) { return errorResponse(error); }
}
