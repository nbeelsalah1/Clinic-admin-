import { env } from "cloudflare:workers";
import { encryptPrivate, getSupabaseUser, sha256 } from "@/lib/clinic-runtime";
import { mailLanguage,trialIsActive } from "@/lib/subscriber-policy";
import { dispatchSubscriberMail, queueSubscriberMail } from "@/lib/subscriber-mail";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const user=await getSupabaseUser(request);if(!user)return Response.json({error:"auth_required"},{status:401});
  if(!env.DB)return Response.json({error:"unavailable"},{status:503});
  const emailHash=await sha256(user.email.trim().toLowerCase());
  const trial=await env.DB.prepare("SELECT id,clinic_name,status,starts_at,ends_at,created_at FROM trial_requests WHERE user_id = ? OR email_hash = ? LIMIT 1").bind(user.userId,emailHash).first<{id:string;clinic_name:string;status:string;starts_at:string|null;ends_at:string|null;created_at:string}>();
  return Response.json({trial:trial?{...trial,expired:trial.status==="approved"&&!trialIsActive(trial.ends_at)}:null},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
  const user=await getSupabaseUser(request);if(!user)return Response.json({error:"auth_required"},{status:401});
  const db=env.DB;if(!db)return Response.json({error:"unavailable"},{status:503});
  try {
    const body=await request.json() as {clinicName?:string;language?:string;consent?:boolean};
    const name=typeof body?.clinicName==="string"?body.clinicName.trim():"";
    if(name.length<2||name.length>160||body.consent!==true)return Response.json({error:"invalid_request"},{status:400});
    const membership=await db.prepare("SELECT id FROM clinic_memberships WHERE active = 1 AND (user_id = ? OR lower(email) = lower(?)) LIMIT 1").bind(user.userId,user.email).first();
    if(membership)return Response.json({error:"existing_clinic"},{status:409});
    const emailHash=await sha256(user.email.trim().toLowerCase());
    if(await db.prepare("SELECT id FROM trial_requests WHERE user_id = ? OR email_hash = ?").bind(user.userId,emailHash).first())return Response.json({error:"already_requested"},{status:409});
    const id=crypto.randomUUID(),language=mailLanguage(body.language);
    const receipt=await queueSubscriberMail(db,`trial-request/${id}`,"trial_requested",user.email,{clinicName:name,language});
    const admin=await db.prepare("SELECT email FROM platform_users WHERE role = 'super_admin' ORDER BY created_at LIMIT 1").first<{email:string}>();
    const alert=admin?await queueSubscriberMail(db,`trial-admin/${id}`,"trial_admin",admin.email,{clinicName:name,language:"ar"}):null;
    await db.batch([
      db.prepare("INSERT INTO trial_requests (id,user_id,email_hash,email_enc,clinic_name,language) VALUES (?,?,?,?,?,?)").bind(id,user.userId,emailHash,await encryptPrivate(user.email),name,language),
      receipt.statement,...(alert?[alert.statement]:[]),
      db.prepare("INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,'trial.requested','trial',?)").bind(crypto.randomUUID(),user.userId,id),
    ]);
    await Promise.all([dispatchSubscriberMail(db,receipt.id),...(alert?[dispatchSubscriberMail(db,alert.id)]:[])]);
    return Response.json({ok:true,status:"pending"},{status:201});
  }catch{return Response.json({error:"request_failed"},{status:409});}
}
