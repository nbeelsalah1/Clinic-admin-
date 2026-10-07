import { env } from "cloudflare:workers";
import { currentProgramContext, encryptPrivate, isAccountContext } from "@/lib/clinic-runtime";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const ctx = await currentProgramContext(request);
  if (!isAccountContext(ctx)) return ctx;
  if (!ctx.isSuperAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
  try {
    const saved = await ctx.db.prepare("SELECT api_key_enc FROM ai_provider_settings WHERE provider='openai'").first<{ api_key_enc: string }>();
    return Response.json({ configured: Boolean(saved?.api_key_enc || env.OPENAI_API_KEY) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "settings_unavailable" }, { status: 503 });
  }
}

export async function PUT(request: Request) {
  const ctx = await currentProgramContext(request);
  if (!isAccountContext(ctx)) return ctx;
  if (!ctx.isSuperAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!env.APP_DATA_KEY) return Response.json({ error: "encryption_unavailable" }, { status: 503 });
  let body: { apiKey?: unknown };
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  if (!body || typeof body.apiKey !== "string" || !/^sk-[A-Za-z0-9_-]{20,500}$/.test(body.apiKey.trim())) {
    return Response.json({ error: "invalid_api_key" }, { status: 400 });
  }
  try {
    const encrypted = await encryptPrivate(body.apiKey.trim());
    await ctx.db.batch([
      ctx.db.prepare("INSERT INTO ai_provider_settings (provider, api_key_enc) VALUES ('openai', ?) ON CONFLICT(provider) DO UPDATE SET api_key_enc=excluded.api_key_enc, updated_at=CURRENT_TIMESTAMP").bind(encrypted),
      ctx.db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id) VALUES (?, ?, 'openai.settings_updated', 'integration', 'openai')").bind(crypto.randomUUID(), ctx.user.userId),
    ]);
    return Response.json({ configured: true }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return Response.json({ error: "settings_unavailable" }, { status: 503 });
  }
}
