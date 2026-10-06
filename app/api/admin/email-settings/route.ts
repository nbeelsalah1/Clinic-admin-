import { currentProgramContext, decryptPrivate, encryptPrivate, isAccountContext } from "@/lib/clinic-runtime";
import { emailConfig, dispatchSubscriberMail } from "@/lib/subscriber-mail";
import { validEmail } from "@/lib/subscriber-policy";
export const dynamic="force-dynamic";
export async function GET(request:Request){
  const ctx=await currentProgramContext(request);if(!isAccountContext(ctx))return ctx;
  if(!ctx.isSuperAdmin)return Response.json({error:"forbidden"},{status:403});
  const config=await emailConfig(ctx.db);
  const rows=await ctx.db.prepare("SELECT id,kind,recipient_enc,status,attempts,error_code,provider_id,created_at FROM email_outbox ORDER BY created_at DESC LIMIT 50").all<{id:string;kind:string;recipient_enc:string;status:string;attempts:number;error_code:string|null;provider_id:string|null;created_at:string}>();
  const messages=await Promise.all(rows.results.map(async r=>{const {recipient_enc,...safe}=r;return {...safe,recipient:await decryptPrivate(recipient_enc)};}));
  return Response.json({configured:Boolean(config),enabled:Boolean(config?.enabled),fromEmail:config?.from_email??"",replyTo:config?.reply_to??ctx.user.email,messages},{headers:{"Cache-Control":"no-store"}});
}
export async function PUT(request:Request){
  const ctx=await currentProgramContext(request);if(!isAccountContext(ctx))return ctx;
  if(!ctx.isSuperAdmin)return Response.json({error:"forbidden"},{status:403});
  let body:{apiKey?:string;fromEmail?:string;replyTo?:string;enabled?:boolean};
  try{body=await request.json();}catch{return Response.json({error:"invalid_request"},{status:400});}
  const existing=await emailConfig(ctx.db);
  if(!body||!validEmail(body.fromEmail)||!validEmail(body.replyTo)||typeof body.enabled!=="boolean"||/^(gmail|yahoo|hotmail|outlook|resend)\.(com|dev)$/i.test(body.fromEmail.split("@")[1])
    ||(body.apiKey&&!/^re_[A-Za-z0-9_-]{10,200}$/.test(body.apiKey))||(!existing&&!body.apiKey))return Response.json({error:"invalid_request"},{status:400});
  const key=body.apiKey?await encryptPrivate(body.apiKey):existing!.api_key_enc;
  await ctx.db.batch([
    ctx.db.prepare("INSERT INTO email_settings (provider,api_key_enc,from_email,reply_to,enabled) VALUES ('resend',?,?,?,?) ON CONFLICT(provider) DO UPDATE SET api_key_enc = excluded.api_key_enc, from_email = excluded.from_email, reply_to = excluded.reply_to, enabled = excluded.enabled, updated_at = CURRENT_TIMESTAMP").bind(key,body.fromEmail,body.replyTo,body.enabled?1:0),
    ctx.db.prepare("INSERT INTO audit_logs (id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,'resend.settings_updated','integration','resend')").bind(crypto.randomUUID(),ctx.user.userId),
  ]);
  return Response.json({ok:true},{headers:{"Cache-Control":"no-store"}});
}
export async function POST(request:Request){
  const ctx=await currentProgramContext(request);if(!isAccountContext(ctx))return ctx;
  if(!ctx.isSuperAdmin)return Response.json({error:"forbidden"},{status:403});
  const config=await emailConfig(ctx.db);if(!config?.enabled)return Response.json({error:"not_configured"},{status:409});
  const rows=await ctx.db.prepare("SELECT id FROM email_outbox WHERE status IN ('queued','retry','sending') AND attempts < 3 AND next_attempt_at <= ? ORDER BY created_at LIMIT 5").bind(Math.floor(Date.now()/1000)).all<{id:string}>();
  const results=[];for(const row of rows.results)results.push(await dispatchSubscriberMail(ctx.db,row.id));
  return Response.json({processed:results.length,results},{headers:{"Cache-Control":"no-store"}});
}
