import { env } from "cloudflare:workers";
import { decryptPrivate } from "./clinic-runtime";
import { DIDIT_BASE_URL } from "./didit-policy";

export type DiditConfig = { api_key_enc: string; workflow_id: string; environment: "sandbox" | "live"; revision: string };
export type VerificationRow = { id: string; user_id: string; session_id: string; session_url_enc: string; config_revision: string; environment: string; status: string; document_status: string; phone_status: string; created_at: string; updated_at: string };
export async function diditConfig(db: D1Database) {
  return db.prepare("SELECT api_key_enc, workflow_id, environment, revision FROM verification_settings WHERE provider = 'didit'").first<DiditConfig>();
}
export async function latestVerification(db: D1Database, userId: string, revision: string) {
  return db.prepare("SELECT * FROM identity_verifications WHERE user_id = ? AND config_revision = ? ORDER BY created_at DESC, rowid DESC LIMIT 1").bind(userId, revision).first<VerificationRow>();
}
export async function takeLimit(db: D1Database, bucket: string, maximum: number, cooldownSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const row = await db.prepare(`INSERT INTO verification_limits (bucket, count, last_at) VALUES (?, 1, ?)
    ON CONFLICT(bucket) DO UPDATE SET count = count + 1, last_at = excluded.last_at
    WHERE count < ? AND last_at <= ? RETURNING bucket`).bind(bucket, now, maximum, now - cooldownSeconds).first();
  // Bound retention of rate-limit metadata.
  await db.prepare("DELETE FROM verification_limits WHERE last_at < ?").bind(now - 172800).run();
  return Boolean(row);
}
export async function diditRequest(config: DiditConfig, path: string, body?: Record<string, unknown>) {
  const key = await decryptPrivate(config.api_key_enc);
  if (!key || !env.APP_DATA_KEY) throw new Error("provider_unavailable");
  const response = await fetch(`${DIDIT_BASE_URL}${path}`, {
    method: body ? "POST" : "GET",
    headers: { "x-api-key": key, "Content-Type": "application/json", Accept: "application/json" },
    ...(body ? { body: JSON.stringify(body) } : {}),
    signal: AbortSignal.timeout(12000),
    redirect: "error",
  });
  if (!response.ok) {
    // Provider bodies can contain identity evidence. Never log or relay them.
    throw new Error(response.status === 401 || response.status === 403 ? "provider_auth" : response.status === 402 ? "provider_balance" : "provider_unavailable");
  }
  return await response.json() as Record<string, unknown>;
}
