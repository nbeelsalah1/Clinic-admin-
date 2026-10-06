import { env } from "cloudflare:workers";
import { decryptPrivate, encryptPrivate, getSupabaseUser } from "@/lib/clinic-runtime";
import { canResume, decisionStatuses, isVerified, safeSessionUrl, safeStatus, SITE_ORIGIN } from "@/lib/didit-policy";
import { diditConfig, diditRequest, latestVerification, takeLimit, type VerificationRow } from "@/lib/didit-runtime";

export const dynamic = "force-dynamic";
function reply(data: unknown, status = 200) { return Response.json(data, { status, headers: { "Cache-Control": "no-store" } }); }
async function view(row: VerificationRow | null) {
  if (!row) return null;
  return { status: row.status, documentStatus: row.document_status, phoneStatus: row.phone_status, environment: row.environment,
    verified: isVerified(row.environment, row.status, row.document_status, row.phone_status), updatedAt: row.updated_at,
    url: canResume(row.status, row.created_at) ? safeSessionUrl(await decryptPrivate(row.session_url_enc)) : null };
}
export async function GET(request: Request) {
  const user = await getSupabaseUser(request);
  if (!user) return reply({ error: "auth_required" }, 401);
  const db = env.DB;
  if (!db) return reply({ error: "database_unavailable" }, 503);
  const config = await diditConfig(db);
  return reply({ configured: Boolean(config), environment: config?.environment ?? null, verification: config ? await view(await latestVerification(db, user.userId, config.revision)) : null });
}
export async function POST(request: Request) {
  const user = await getSupabaseUser(request);
  if (!user) return reply({ error: "auth_required" }, 401);
  const db = env.DB;
  if (!db || !env.APP_DATA_KEY) return reply({ error: "database_unavailable" }, 503);
  const config = await diditConfig(db);
  if (!config) return reply({ error: "not_configured" }, 503);
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return reply({ error: "invalid_request" }, 400); }
  if (!body || !["start", "refresh"].includes(String(body.action))) return reply({ error: "invalid_request" }, 400);
  const row = await latestVerification(db, user.userId, config.revision);
  const day = new Date().toISOString().slice(0, 10);
  try {
    if (body.action === "refresh") {
      if (!row) return reply({ verification: null });
      if (!await takeLimit(db, `refresh:${user.userId}:${day}`, 300, 15)) return reply({ error: "rate_limited" }, 429);
      const result = await diditRequest(config, `/session/${encodeURIComponent(row.session_id)}/decision/`);
      // Only the server-owned session can update this user's check results.
      if (result.session_id !== row.session_id) throw new Error("provider_unavailable");
      const states = decisionStatuses(result);
      await db.prepare("UPDATE identity_verifications SET status = ?, document_status = ?, phone_status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND user_id = ?")
        .bind(states.status, states.documentStatus, states.phoneStatus, row.id, user.userId).run();
      return reply({ verification: await view(await latestVerification(db, user.userId, config.revision)) });
    }
    if (row && (canResume(row.status, row.created_at) || isVerified(row.environment, row.status, row.document_status, row.phone_status))) return reply({ verification: await view(row) });
    if (!await takeLimit(db, `start:${user.userId}:${day}`, 3, 60) || !await takeLimit(db, `global:start:${day}`, 25, 0)) return reply({ error: "rate_limited" }, 429);
    const language = ["ar", "he", "en"].includes(String(body.language)) ? String(body.language) : "ar";
    const result = await diditRequest(config, "/session/", { workflow_id: config.workflow_id, vendor_data: user.userId, language,
      callback: `${SITE_ORIGIN}/?verification=return`, callback_method: "both", ...(config.environment === "sandbox" ? { sandbox_scenario: "approve" } : {}) });
    const url = safeSessionUrl(result.url);
    if (!url || typeof result.session_id !== "string" || !/^[a-f0-9-]{36}$/i.test(result.session_id)) throw new Error("provider_unavailable");
    const encryptedUrl = await encryptPrivate(url);
    if (!encryptedUrl) throw new Error("provider_unavailable");
    await db.prepare("INSERT INTO identity_verifications (id, user_id, session_id, session_url_enc, config_revision, environment, status) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind(crypto.randomUUID(), user.userId, result.session_id, encryptedUrl, config.revision, config.environment, safeStatus(result.status)).run();
    return reply({ verification: await view(await latestVerification(db, user.userId, config.revision)) }, 201);
  } catch (error) {
    const code = error instanceof Error && ["provider_auth", "provider_balance"].includes(error.message) ? error.message : "provider_unavailable";
    return reply({ error: code }, 502);
  }
}
