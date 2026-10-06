import { env } from "cloudflare:workers";
import { currentProgramContext, encryptPrivate, isAccountContext } from "@/lib/clinic-runtime";
import { diditConfig } from "@/lib/didit-runtime";
import { SANDBOX_WORKFLOW_ID } from "@/lib/didit-policy";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const ctx = await currentProgramContext(request);
  if (!isAccountContext(ctx)) return ctx;
  if (!ctx.isSuperAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
  const config = await diditConfig(ctx.db);
  return Response.json({ configured: Boolean(config), workflowId: config?.workflow_id ?? SANDBOX_WORKFLOW_ID, environment: config?.environment ?? "sandbox" }, { headers: { "Cache-Control": "no-store" } });
}
export async function PUT(request: Request) {
  const ctx = await currentProgramContext(request);
  if (!isAccountContext(ctx)) return ctx;
  if (!ctx.isSuperAdmin) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!env.APP_DATA_KEY) return Response.json({ error: "database_unavailable" }, { status: 503 });
  let body: Record<string, unknown>;
  try { body = await request.json(); } catch { return Response.json({ error: "invalid_request" }, { status: 400 }); }
  if (!body || typeof body.apiKey !== "string" || !/^[A-Za-z0-9_\-]{20,256}$/.test(body.apiKey) || typeof body.workflowId !== "string" || !/^[a-f0-9-]{36}$/i.test(body.workflowId)
    || !["sandbox", "live"].includes(String(body.environment))
    || body.workflowId === "79526c1f-b395-4113-a079-a7f429e062a6"
    || (body.environment === "live" && body.workflowId === SANDBOX_WORKFLOW_ID)) return Response.json({ error: "invalid_request" }, { status: 400 });
  const encrypted = await encryptPrivate(body.apiKey);
  const revision = crypto.randomUUID();
  await ctx.db.batch([
    ctx.db.prepare("INSERT INTO verification_settings (provider, api_key_enc, workflow_id, environment, revision) VALUES ('didit', ?, ?, ?, ?) ON CONFLICT(provider) DO UPDATE SET api_key_enc = excluded.api_key_enc, workflow_id = excluded.workflow_id, environment = excluded.environment, revision = excluded.revision, updated_at = CURRENT_TIMESTAMP")
      .bind(encrypted, body.workflowId, body.environment, revision),
    ctx.db.prepare("INSERT INTO audit_logs (id, actor_user_id, action, resource_type, resource_id) VALUES (?, ?, 'didit.settings_updated', 'integration', 'didit')").bind(crypto.randomUUID(), ctx.user.userId),
  ]);
  return Response.json({ configured: true }, { headers: { "Cache-Control": "no-store" } });
}
