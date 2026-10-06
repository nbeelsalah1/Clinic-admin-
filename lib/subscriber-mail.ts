import { decryptPrivate, encryptPrivate } from "./clinic-runtime";
import { subscriberEmail, type MailKind, type SubscriberMessage } from "./subscriber-templates";
type EmailConfig={api_key_enc:string;from_email:string;reply_to:string;enabled:number};
type OutboxRow={id:string;payload_enc:string|null;request_enc:string|null;recipient_enc:string;attempts:number;first_attempt_at:number};
export async function emailConfig(db:D1Database){return db.prepare("SELECT * FROM email_settings WHERE provider = 'resend'").first<EmailConfig>();}
export async function queueSubscriberMail(db:D1Database,eventKey:string,kind:MailKind,to:string,data:SubscriberMessage,guard?:{trialId:string;clinicId?:string;status?:"approved"|"rejected"}) {
  const id=crypto.randomUUID();
  const recipient=await encryptPrivate(to),payload=await encryptPrivate(JSON.stringify(subscriberEmail(kind,data)));
  const sql="INSERT OR IGNORE INTO email_outbox (id,event_key,kind,recipient_enc,payload_enc) SELECT ?,?,?,?,?";
  const statement=guard?db.prepare(sql+" WHERE EXISTS (SELECT 1 FROM trial_requests WHERE id = ? AND status = ?"+(guard.clinicId?" AND clinic_id = ?":"")+")")
    .bind(id,eventKey,kind,recipient,payload,guard.trialId,guard.status??"approved",...(guard.clinicId?[guard.clinicId]:[]))
    :db.prepare(sql).bind(id,eventKey,kind,recipient,payload);
  return {id,statement};
}
export async function sendOutboxMail(db:D1Database,id:string) {
  const config=await emailConfig(db);
  if(!config?.enabled)return "not_configured";
  const now=Math.floor(Date.now()/1000);
  const row=await db.prepare("UPDATE email_outbox SET status = 'sending', attempts = attempts + 1, locked_at = ?, first_attempt_at = COALESCE(first_attempt_at, ?) WHERE id = ? AND status IN ('queued','retry','sending') AND attempts < 3 AND next_attempt_at <= ? AND (locked_at IS NULL OR locked_at < ?) RETURNING *")
    .bind(now,now,id,now,now-60).first<OutboxRow>();
  if(!row)return "skipped";
  if(now-row.first_attempt_at>23*3600){await db.prepare("UPDATE email_outbox SET status = 'blocked', error_code = 'idempotency_window_expired', locked_at = NULL WHERE id = ?").bind(id).run();return "blocked";}
  let error="network",retry=true;
  try {
    let serialized:string;
    if(row.request_enc)serialized=await decryptPrivate(row.request_enc);
    else {
      const content=JSON.parse(await decryptPrivate(row.payload_enc)) as {subject:string;text:string;html:string};
      serialized=JSON.stringify({from:`Ayadati <${config.from_email}>`,to:[await decryptPrivate(row.recipient_enc)],reply_to:config.reply_to,...content});
      await db.prepare("UPDATE email_outbox SET request_enc = ? WHERE id = ?").bind(await encryptPrivate(serialized),id).run();
    }
    const response=await fetch("https://api.resend.com/emails",{method:"POST",headers:{Authorization:`Bearer ${await decryptPrivate(config.api_key_enc)}`,"Content-Type":"application/json","Idempotency-Key":`clinic-ops/${id}`},body:serialized,redirect:"error",signal:AbortSignal.timeout(8000)});
    if(response.ok){const data=await response.json() as {id?:string};if(!data.id)throw new Error("invalid_response");
      await db.prepare("UPDATE email_outbox SET status = 'accepted', provider_id = ?, accepted_at = CURRENT_TIMESTAMP, locked_at = NULL, error_code = NULL, payload_enc = NULL, request_enc = NULL WHERE id = ?").bind(data.id,id).run();return "accepted";
    }
    error=`http_${response.status}`;retry=response.status===429||response.status>=500||response.status===409;
  }catch{ /* Do not log provider responses, recipients, license codes or API keys. */ }
  const status=retry&&row.attempts<3?"retry":"failed";
  await db.prepare("UPDATE email_outbox SET status = ?, error_code = ?, next_attempt_at = ?, locked_at = NULL WHERE id = ?").bind(status,error,now+Math.pow(2,row.attempts)*60,id).run();
  return status;
}
export async function dispatchSubscriberMail(db:D1Database,id:string){try{return await sendOutboxMail(db,id);}catch{return "queued";}}
