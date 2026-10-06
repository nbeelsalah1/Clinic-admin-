import { currentProgramContext, decryptPrivate, isAccountContext } from "@/lib/clinic-runtime";
import { mailLanguage, trialExpiry, trialIsActive } from "@/lib/subscriber-policy";
import { dispatchSubscriberMail, queueSubscriberMail } from "@/lib/subscriber-mail";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const ctx=await currentProgramContext(request);if(!isAccountContext(ctx))return ctx;
  if(!ctx.isSuperAdmin)return Response.json({error:"forbidden"},{status:403});
  const rows=await ctx.db.prepare("SELECT id,clinic_name,email_enc,status,starts_at,ends_at,created_at FROM trial_requests ORDER BY created_at DESC LIMIT 100").all<{id:string;clinic_name:string;email_enc:string;status:string;starts_at:string;ends_at:string;created_at:string}>();
  const trials=await Promise.all(rows.results.map(async r=>{const {email_enc,...safe}=r;return {...safe,email:await decryptPrivate(email_enc),expired:r.status==="approved"&&!trialIsActive(r.ends_at)};}));
  return Response.json({trials},{headers:{"Cache-Control":"no-store"}});
}
export async function PATCH(request:Request){
  const ctx=await currentProgramContext(request);if(!isAccountContext(ctx))return ctx;
  if(!ctx.isSuperAdmin)return Response.json({error:"forbidden"},{status:403});
  try {
    const body=await request.json() as {id?:string;action?:string};
    if(!body?.id||!["approve","reject"].includes(String(body.action)))return Response.json({error:"invalid_request"},{status:400});
    const trial=await ctx.db.prepare("SELECT * FROM trial_requests WHERE id = ? AND status = 'pending'").bind(body.id).first<{id:string;user_id:string;email_enc:string;clinic_name:string;language:string}>();
    if(!trial)return Response.json({error:"not_pending"},{status:409});
    const email=await decryptPrivate(trial.email_enc);
    if(body.action==="reject"){
      const mail=await queueSubscriberMail(ctx.db,`trial-rejected/${trial.id}`,"trial_rejected",email,{clinicName:trial.clinic_name,language:mailLanguage(trial.language)},{trialId:trial.id,status:"rejected"});
      const result=await ctx.db.batch([
        ctx.db.prepare("UPDATE trial_requests SET status = 'rejected', reviewed_by = ? WHERE id = ? AND status = 'pending'").bind(ctx.user.userId,trial.id),
        mail.statement,
        ctx.db.prepare("INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,'trial.rejected','trial',? WHERE EXISTS (SELECT 1 FROM trial_requests WHERE id = ? AND status = 'rejected' AND reviewed_by = ?)").bind(crypto.randomUUID(),ctx.user.userId,trial.id,trial.id,ctx.user.userId),
      ]);
      if(!result[0].meta.changes)return Response.json({error:"not_pending"},{status:409});
      await dispatchSubscriberMail(ctx.db,mail.id);return Response.json({ok:true});
    }
    if(await ctx.db.prepare("SELECT id FROM clinic_memberships WHERE active = 1 AND (user_id = ? OR lower(email) = lower(?)) LIMIT 1").bind(trial.user_id,email).first())return Response.json({error:"existing_clinic"},{status:409});
    const clinicId=crypto.randomUUID(),now=new Date(),endsAt=trialExpiry(now);
    const mail=await queueSubscriberMail(ctx.db,`trial-approved/${trial.id}`,"trial_approved",email,{clinicName:trial.clinic_name,language:mailLanguage(trial.language),expiresAt:endsAt},{trialId:trial.id,clinicId});
    await ctx.db.batch([
      ctx.db.prepare("INSERT INTO clinics (id,name,owner_user_id,trial_ends_at) SELECT ?,?,?,? WHERE EXISTS (SELECT 1 FROM trial_requests WHERE id = ? AND status = 'pending')").bind(clinicId,trial.clinic_name,trial.user_id,endsAt,trial.id),
      ctx.db.prepare("INSERT INTO clinic_memberships (id,clinic_id,user_id,email,role) SELECT ?,?,?,?,'clinic_admin' WHERE EXISTS (SELECT 1 FROM clinics WHERE id = ? AND owner_user_id = ?)").bind(crypto.randomUUID(),clinicId,trial.user_id,email,clinicId,trial.user_id),
      ctx.db.prepare("UPDATE trial_requests SET status = 'approved', clinic_id = ?, starts_at = ?, ends_at = ?, reviewed_by = ? WHERE id = ? AND status = 'pending' AND EXISTS (SELECT 1 FROM clinics WHERE id = ?)").bind(clinicId,now.toISOString(),endsAt,ctx.user.userId,trial.id,clinicId),
      mail.statement,
      ctx.db.prepare("INSERT INTO audit_logs (id,clinic_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,'trial.approved','trial',? WHERE EXISTS (SELECT 1 FROM trial_requests WHERE id = ? AND clinic_id = ? AND status = 'approved')").bind(crypto.randomUUID(),clinicId,ctx.user.userId,trial.id,trial.id,clinicId),
    ]);
    const approved=await ctx.db.prepare("SELECT clinic_id FROM trial_requests WHERE id = ? AND clinic_id = ? AND status = 'approved'").bind(trial.id,clinicId).first();
    if(!approved)return Response.json({error:"not_pending"},{status:409});
    await dispatchSubscriberMail(ctx.db,mail.id);return Response.json({ok:true,endsAt});
  }catch{return Response.json({error:"request_failed"},{status:409});}
}
