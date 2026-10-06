import { currentClinicContext, encryptPrivate, isClinicContext } from "../../../../lib/clinic-runtime";

export async function GET(request: Request) {
  const context = await currentClinicContext(request);
  if (!isClinicContext(context)) return context;
  const row = await context.db.prepare("SELECT gateway_url, sender_id, updated_at FROM sms_settings WHERE clinic_id = ?").bind(context.clinicId).first<{ gateway_url: string; sender_id: string; updated_at: string }>();
  return Response.json({ configured: Boolean(row), gatewayUrl: row?.gateway_url ?? "", senderId: row?.sender_id ?? "", updatedAt: row?.updated_at ?? null });
}

export async function PUT(request: Request) {
  const context = await currentClinicContext(request);
  if (!isClinicContext(context)) return context;
  if (context.role !== "clinic_admin") return Response.json({ error: "Clinic administrator access is required." }, { status: 403 });
  try {
    const body = await request.json() as { gatewayUrl?: string; senderId?: string; token?: string };
    const rawUrl = body.gatewayUrl?.trim() ?? "";
    const senderId = body.senderId?.trim().slice(0, 32) ?? "";
    const token = body.token?.trim() ?? "";
    let url: URL;
    try { url = new URL(rawUrl); } catch { return Response.json({ error: "Enter a valid SMS gateway URL." }, { status: 400 }); }
    const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const isPrivateAddress = /^(localhost|.*\.localhost|.*\.local|.*\.internal|10\.|127\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(host) || host === "::1" || host.startsWith("fc") || host.startsWith("fd") || host.startsWith("fe80:");
    if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.port && url.port !== "443") || isPrivateAddress || !senderId || token.length < 8 || token.length > 2048) return Response.json({ error: "Use a public HTTPS SMS gateway URL, sender ID, and valid API token." }, { status: 400 });
    const encryptedToken = await encryptPrivate(token);
    await context.db.prepare("INSERT INTO sms_settings (clinic_id, gateway_url, sender_id, token_ciphertext, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP) ON CONFLICT(clinic_id) DO UPDATE SET gateway_url = excluded.gateway_url, sender_id = excluded.sender_id, token_ciphertext = excluded.token_ciphertext, updated_at = CURRENT_TIMESTAMP")
      .bind(context.clinicId, url.toString(), senderId, encryptedToken).run();
    return Response.json({ ok: true, configured: true, gatewayUrl: url.toString(), senderId, updatedAt: new Date().toISOString() });
  } catch (error) {
    console.error("SMS config save failed", error);
    return Response.json({ error: "Could not save SMS settings. Check the encryption configuration." }, { status: 503 });
  }
}
