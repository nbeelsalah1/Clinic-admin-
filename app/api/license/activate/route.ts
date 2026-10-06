import { env } from "cloudflare:workers";
import { getSupabaseUser, sha256 } from "../../../../lib/clinic-runtime";

export async function POST(request: Request) {
  const user = await getSupabaseUser(request);
  if (!user) return Response.json({ error: "Sign in before activating a license." }, { status: 401 });
  if (!env.DB) return Response.json({ error: "The clinic database is not available yet." }, { status: 503 });
  try {
    const body = await request.json() as { licenseKey?: string; clinicName?: string };
    const code = body.licenseKey?.trim().toUpperCase() ?? "";
    const clinicName = body.clinicName?.trim().slice(0, 160) ?? "";
    if (!/^AYD-[A-Z2-9]{5}(?:-[A-Z2-9]{5}){3}$/.test(code) || !clinicName) return Response.json({ error: "Enter a valid activation code and clinic name." }, { status: 400 });
    const existing = await env.DB.prepare("SELECT c.id, c.name, c.owner_user_id, c.license_id FROM clinic_memberships m JOIN clinics c ON c.id = m.clinic_id WHERE m.user_id = ? AND m.active = 1 AND m.role = 'clinic_admin' LIMIT 1").bind(user.userId).first<{ id: string; name: string; owner_user_id: string; license_id: string | null }>();
    if (existing && existing.owner_user_id !== user.userId) return Response.json({ error: "Only the clinic owner can renew its license." }, { status: 403 });
    if (existing?.license_id) {
      const active = await env.DB.prepare("SELECT status, expires_at FROM licenses WHERE id = ?").bind(existing.license_id).first<{ status: string; expires_at: string }>();
      if (active?.status === "active" && active.expires_at > new Date().toISOString()) return Response.json({ error: "This clinic already has an active subscription." }, { status: 409 });
    }
    const keyHash = await sha256(code);
    const license = await env.DB.prepare(
      "SELECT l.id, l.subscription_id, l.expires_at FROM licenses l JOIN subscriptions s ON s.id = l.subscription_id WHERE l.key_hash = ? AND l.status = 'issued' AND s.payment_status = 'paid' AND lower(s.contact_email) = lower(?) AND l.expires_at > ?",
    ).bind(keyHash, user.email, new Date().toISOString()).first<{ id: string; subscription_id: string; expires_at: string }>();
    if (!license) return Response.json({ error: "The code is invalid, expired, already used, or not paid." }, { status: 404 });
    const clinicId = existing?.id ?? crypto.randomUUID();
    const now = new Date().toISOString();
    const statements = existing ? [
      env.DB.prepare("UPDATE clinics SET license_id = ? WHERE id = ?").bind(license.id, clinicId),
      env.DB.prepare("UPDATE licenses SET status = 'active', clinic_id = ?, activated_at = ? WHERE id = ? AND status = 'issued'").bind(clinicId, now, license.id),
    ] : [
      env.DB.prepare("INSERT INTO clinics (id, name, owner_user_id, license_id) VALUES (?, ?, ?, ?)").bind(clinicId, clinicName, user.userId, license.id),
      env.DB.prepare("INSERT INTO clinic_memberships (id, clinic_id, user_id, email, role) VALUES (?, ?, ?, ?, 'clinic_admin')").bind(crypto.randomUUID(), clinicId, user.userId, user.email),
      env.DB.prepare("UPDATE licenses SET status = 'active', clinic_id = ?, activated_at = ? WHERE id = ? AND status = 'issued'").bind(clinicId, now, license.id),
    ];
    statements.push(env.DB.prepare("INSERT INTO audit_logs (id, clinic_id, actor_user_id, action, resource_type, resource_id) VALUES (?, ?, ?, 'license.activated', 'license', ?)").bind(crypto.randomUUID(), clinicId, user.userId, license.id));
    statements.push(env.DB.prepare("UPDATE trial_requests SET status = 'converted' WHERE clinic_id = ? AND status = 'approved'").bind(clinicId));
    await env.DB.batch(statements);
    return Response.json({ ok: true, clinic: { id: clinicId, name: existing?.name ?? clinicName }, expiresAt: license.expires_at }, { status: 201 });
  } catch (error) {
    console.error("license activation failed", error);
    return Response.json({ error: "Could not activate this license. It may already have been used." }, { status: 409 });
  }
}
