import { env } from "cloudflare:workers";
import { headers } from "next/headers";
import { trialIsActive } from "./subscriber-policy";

export type ClinicContext = {
  user: { userId: string; email: string; displayName: string; fullName: string | null };
  clinicId: string;
  clinicName: string;
  role: string;
  isSuperAdmin: boolean;
  trialEndsAt: string | null;
  db: D1Database;
  branchId: string;
  branchName: string;
};

export async function getSupabaseUser(request: Request) {
  const authorization = request.headers.get("authorization") ?? "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return null;
  const baseUrl = env.SUPABASE_URL;
  const publishableKey = env.SUPABASE_PUBLISHABLE_KEY;
  if (!baseUrl || !publishableKey) return null;
  try {
    const response = await fetch(`${baseUrl.replace(/\/$/, "")}/auth/v1/user`, {
      headers: { apikey: publishableKey, Authorization: `Bearer ${token}` },
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) return null;
    const result = await response.json() as { factors?: {factor_type?:string;status?:string}[];id?: string; email?: string; email_confirmed_at?: string | null; user_metadata?: { full_name?: string; name?: string } };
    if (!result.id || !result.email || !result.email_confirmed_at) return null;
    // The provider validates this exact bearer token before its claims are read.
    if(result.factors?.some(f=>f.factor_type==='totp'&&f.status==='verified')){
      const payload=JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))) as {aal?:string;sub?:string};
      if(payload.aal!=='aal2'||payload.sub!==result.id)return null;
    }
    const fullName = result.user_metadata?.full_name ?? result.user_metadata?.name ?? null;
    return { userId: result.id, email: result.email, displayName: fullName ?? result.email, fullName };
  } catch {
    return null;
  }
}

export type AccountContext = { user: ClinicContext["user"]; db: D1Database; isSuperAdmin: boolean };
export async function currentAccountContext(request: Request): Promise<AccountContext | Response> {
  const user = await getSupabaseUser(request);
  if (!user) return Response.json({ error: "Sign in is required." }, { status: 401 });
  const db = env.DB;
  if (!db) return Response.json({ error: "The clinic database is not available yet." }, { status: 503 });

  // The Site owner can claim the first program-admin role only from their authenticated Site session.
  // Subsequent clinic users receive only an existing membership matched by verified email.
  const siteHeaders = await headers();
  const siteOwnerEmail = siteHeaders.get("oai-authenticated-user-email");
  if (siteOwnerEmail && siteOwnerEmail.toLowerCase() === user.email.toLowerCase()) {
    const platformCount = await db.prepare("SELECT COUNT(*) AS n FROM platform_users").first<{ n: number }>();
    if ((platformCount?.n ?? 0) === 0) {
      await db.prepare("INSERT OR IGNORE INTO platform_users (user_id, email, role) VALUES (?, ?, 'super_admin')")
        .bind(user.userId, user.email).run();
    }
  }
  // Link an existing Site identity to the verified Supabase identity by email.
  const oldPlatformUser = await db.prepare("SELECT user_id FROM platform_users WHERE lower(email) = lower(?) AND user_id != ? LIMIT 1")
    .bind(user.email, user.userId).first<{ user_id: string }>();
  if (oldPlatformUser) await db.prepare("UPDATE platform_users SET user_id = ? WHERE user_id = ? AND lower(email) = lower(?)")
    .bind(user.userId, oldPlatformUser.user_id, user.email).run();
  const admin = await db.prepare("SELECT role FROM platform_users WHERE user_id = ?").bind(user.userId).first<{role:string}>();
  return {user,db,isSuperAdmin:admin?.role==='super_admin'};
}
export function isAccountContext(value:AccountContext|Response):value is AccountContext{return !(value instanceof Response);}
export async function currentProgramContext(request:Request):Promise<AccountContext|Response>{
  const account=await currentAccountContext(request);if(!isAccountContext(account))return account;
  if(!account.isSuperAdmin)return Response.json({error:'Program administration access is required.'},{status:403});
  return account;
}
export async function currentClinicContext(request: Request): Promise<ClinicContext | Response> {
  const account=await currentAccountContext(request);if(!isAccountContext(account))return account;
  const {user,db,isSuperAdmin}=account;
  const oldMembership = await db.prepare("SELECT user_id FROM clinic_memberships WHERE lower(email) = lower(?) AND user_id != ? AND active = 1 LIMIT 1")
    .bind(user.email, user.userId).first<{ user_id: string }>();
  if (oldMembership) {
    await db.prepare("UPDATE clinic_branch_memberships SET user_id = ? WHERE user_id = ? AND lower(email) = lower(?)")
      .bind(user.userId, oldMembership.user_id, user.email).run();
    await db.prepare("UPDATE clinic_memberships SET user_id = ? WHERE user_id = ? AND lower(email) = lower(?) AND active = 1")
      .bind(user.userId, oldMembership.user_id, user.email).run();
  }
  const membership = await db.prepare(
    "SELECT m.clinic_id, m.role, c.name, c.license_id FROM clinic_memberships m JOIN clinics c ON c.id = m.clinic_id WHERE m.user_id = ? AND m.active = 1 ORDER BY m.created_at LIMIT 1",
  ).bind(user.userId).first<{ clinic_id: string; role: string; name: string; license_id: string | null }>();

  if (!membership) return Response.json({ error: "Activate a paid clinic license to continue." }, { status: 403 });
  const clinicTrial = membership.license_id ? null : await db.prepare("SELECT trial_ends_at FROM clinics WHERE id = ?").bind(membership.clinic_id).first<{trial_ends_at:string|null}>();
  if (membership.license_id) {
    const license = await db.prepare("SELECT id, status, expires_at FROM licenses WHERE id = ? AND clinic_id = ?")
      .bind(membership.license_id, membership.clinic_id).first<{ id: string; status: string; expires_at: string }>();
    if (!license || license.status !== "active" || license.expires_at <= new Date().toISOString()) {
      return Response.json({ error: "The clinic subscription is expired or inactive. Renew the subscription to continue." }, { status: 402 });
    }
  } else if (!isSuperAdmin) {
    if (!trialIsActive(clinicTrial?.trial_ends_at)) return Response.json({error:"The free trial is expired or inactive. Activate a paid subscription to continue."},{status:402});
  }

  const clinicId=membership.clinic_id;
  await db.prepare("INSERT OR IGNORE INTO clinic_branches (id,clinic_id,name,address,phone,status,is_default) VALUES (?,?,'الفرع الرئيسي','','','active',1)").bind(clinicId,clinicId).run();
  // Migrate branch records created by the early generic-record UI without dropping them.
  const legacy=await db.prepare("SELECT id,data_enc FROM clinic_records WHERE clinic_id=? AND module='branches'").bind(clinicId).all<{id:string;data_enc:string}>();
  for(const row of legacy.results){
    try{const b=JSON.parse(await decryptPrivate(row.data_enc)) as {name?:string;address?:string;phone?:string;status?:string};if(b.name?.trim())await db.prepare("INSERT OR IGNORE INTO clinic_branches (id,clinic_id,name,address,phone,status,is_default) VALUES (?,?,?,?,?,?,0)").bind(row.id,clinicId,b.name.slice(0,160),b.address??'',b.phone??'',b.status==='inactive'?'inactive':'active').run();}catch{}
  }
  await db.prepare("INSERT OR IGNORE INTO clinic_branch_memberships (id,clinic_id,branch_id,user_id,email,active) SELECT lower(hex(randomblob(16))),m.clinic_id,?,m.user_id,m.email,1 FROM clinic_memberships m WHERE m.clinic_id=? AND m.active=1 AND m.role!='clinic_admin'").bind(clinicId,clinicId).run();
  const branchRows=isSuperAdmin||membership.role==='clinic_admin'
    ? (await db.prepare("SELECT id,name FROM clinic_branches WHERE clinic_id=? AND status='active' ORDER BY is_default DESC,name").bind(clinicId).all<{id:string;name:string}>()).results
    : (await db.prepare("SELECT b.id,b.name FROM clinic_branch_memberships bm JOIN clinic_branches b ON b.id=bm.branch_id AND b.clinic_id=bm.clinic_id WHERE bm.clinic_id=? AND bm.user_id=? AND bm.active=1 AND b.status='active' ORDER BY b.is_default DESC,b.name").bind(clinicId,user.userId).all<{id:string;name:string}>()).results;
  if(!branchRows.length)return Response.json({error:"Your account is not assigned to an active clinic branch."},{status:403});
  const wanted=request.headers.get('x-clinic-branch-id');const branch=branchRows.find(b=>b.id===wanted)??(!wanted?branchRows[0]:null);
  if(!branch)return Response.json({error:"Your account does not have access to the selected clinic branch."},{status:403});
  return { user, clinicId, clinicName: membership.name, role: membership.role, isSuperAdmin, trialEndsAt: membership.license_id ? null : clinicTrial?.trial_ends_at ?? null, db,branchId:branch.id,branchName:branch.name };
}

function base64ToBytes(value: string): Uint8Array {
  const binary = atob(value);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}
function bytesToBase64(value: Uint8Array): string {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary);
}
async function getDataKey(): Promise<CryptoKey> {
  const encoded = env.APP_DATA_KEY;
  if (!encoded) throw new Error("APP_DATA_KEY is not configured.");
  const raw = base64ToBytes(encoded);
  if (raw.length !== 32) throw new Error("APP_DATA_KEY must be a 32-byte base64 key.");
  return crypto.subtle.importKey("raw", new Uint8Array(raw).buffer as ArrayBuffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

export async function encryptPrivate(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const key = await getDataKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(value));
  return `v1.${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(ciphertext))}`;
}

export async function decryptPrivate(value: string | null): Promise<string> {
  if (!value) return "";
  const [version, ivText, ciphertextText] = value.split(".");
  if (version !== "v1" || !ivText || !ciphertextText) throw new Error("Encrypted record has an unsupported format.");
  const clear = await crypto.subtle.decrypt({ name: "AES-GCM", iv: new Uint8Array(base64ToBytes(ivText)).buffer as ArrayBuffer }, await getDataKey(), new Uint8Array(base64ToBytes(ciphertextText)).buffer as ArrayBuffer);
  return new TextDecoder().decode(clear);
}

export async function sha256(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64(new Uint8Array(digest));
}

export function isClinicContext(value: ClinicContext | Response): value is ClinicContext {
  return !(value instanceof Response);
}

export async function encryptBytes(value:ArrayBuffer){
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const cipher=await crypto.subtle.encrypt({name:'AES-GCM',iv},await getDataKey(),value);
 const out=new Uint8Array(12+cipher.byteLength);out.set(iv);out.set(new Uint8Array(cipher),12);return out;
}
export async function decryptBytes(value:ArrayBuffer){
 const bytes=new Uint8Array(value);return crypto.subtle.decrypt({name:'AES-GCM',iv:bytes.slice(0,12)},await getDataKey(),bytes.slice(12));
}
