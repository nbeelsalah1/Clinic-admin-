import { currentClinicContext, decryptPrivate, encryptPrivate, isClinicContext } from "../../../../lib/clinic-runtime";

export async function POST(request: Request) {
  const context = await currentClinicContext(request);
  if (!isClinicContext(context)) return context;
  if (context.role !== "clinic_admin") return Response.json({ error: "Clinic administrator access is required." }, { status: 403 });
  try {
    const body = await request.json() as { to?: string };
    const to = body.to?.trim().slice(0, 40) ?? "";
    if (!/^\+?[0-9 ()-]{8,24}$/.test(to)) return Response.json({ error: "Enter a valid phone number." }, { status: 400 });
    const recent = await context.db.prepare("SELECT COUNT(*) AS count FROM sms_logs WHERE clinic_id = ? AND created_at >= datetime('now', '-1 day')").bind(context.clinicId).first<{ count: number }>();
    if ((recent?.count ?? 0) >= 5) return Response.json({ error: "The daily test-message limit has been reached." }, { status: 429 });
    const settings = await context.db.prepare("SELECT gateway_url, sender_id, token_ciphertext FROM sms_settings WHERE clinic_id = ?").bind(context.clinicId).first<{ gateway_url: string; sender_id: string; token_ciphertext: string }>();
    if (!settings) return Response.json({ error: "Configure the SMS gateway first." }, { status: 409 });
    const token = await decryptPrivate(settings.token_ciphertext);
    const response = await fetch(settings.gateway_url, {
      method: "POST",
      redirect: "error",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ to, from: settings.sender_id, text: "هذه رسالة اختبار من نظام عيادتي. لا ترد على هذه الرسالة." }),
      signal: AbortSignal.timeout(12000),
    });
    const id = crypto.randomUUID();
    const recipientCiphertext = await encryptPrivate(to);
    if (!response.ok) {
      await context.db.prepare("INSERT INTO sms_logs (id, clinic_id, recipient_ciphertext, status, error_code) VALUES (?, ?, ?, 'failed', ?)")
        .bind(id, context.clinicId, recipientCiphertext, `HTTP_${response.status}`).run();
      return Response.json({ error: `The SMS gateway returned HTTP ${response.status}.` }, { status: 502 });
    }
    const result = await response.json().catch(() => ({})) as { id?: string; message_id?: string };
    await context.db.prepare("INSERT INTO sms_logs (id, clinic_id, recipient_ciphertext, status, provider_message_id) VALUES (?, ?, ?, 'sent', ?)")
      .bind(id, context.clinicId, recipientCiphertext, result.message_id ?? result.id ?? null).run();
    return Response.json({ ok: true, message: "Test message accepted by the gateway." });
  } catch (error) {
    console.error("SMS test failed", error);
    return Response.json({ error: "Could not reach the SMS gateway. Check its URL and credentials." }, { status: 502 });
  }
}
