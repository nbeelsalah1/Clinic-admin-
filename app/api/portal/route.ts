import {z} from 'zod';
import {workflowQuota} from '../../../lib/workflow-policy';
import {currentAccountContext,isAccountContext,decryptPrivate,encryptPrivate,sha256} from '../../../lib/clinic-runtime';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){try{
 const c=await currentAccountContext(request);if(!isAccountContext(c))return c;
 const hash=await sha256(c.user.email.trim().toLowerCase());
 const links=(await c.db.prepare('SELECT a.id AS access_id,a.clinic_id,a.patient_id,c.name AS clinic_name,p.full_name_enc,p.email_enc FROM patient_portal_access a JOIN clinics c ON c.id=a.clinic_id JOIN patients p ON p.id=a.patient_id AND p.clinic_id=a.clinic_id WHERE a.email_hash=? AND a.active=1 LIMIT 50').bind(hash).all<{access_id:string;clinic_id:string;patient_id:string;clinic_name:string;full_name_enc:string;email_enc:string|null}>()).results;
 const profiles=[];
 for(const link of links){
  // Revalidate the current patient email: changing a record immediately invalidates old access.
  if((await decryptPrivate(link.email_enc)).trim().toLowerCase()!==c.user.email.trim().toLowerCase())continue;
  const [appointments,invoices,records]=await Promise.all([
   c.db.prepare('SELECT id,starts_at,duration_minutes,service,doctor_name,status FROM appointments WHERE clinic_id=? AND patient_id=? ORDER BY starts_at DESC LIMIT 100').bind(link.clinic_id,link.patient_id).all(),
   c.db.prepare("SELECT number,total,paid,status,created_at FROM invoices WHERE clinic_id=? AND patient_id=? AND status!='void' ORDER BY created_at DESC LIMIT 100").bind(link.clinic_id,link.patient_id).all(),
   c.db.prepare("SELECT id,module,data_enc FROM clinic_records WHERE clinic_id=? AND patient_id=? AND module IN ('specialty','visits','lab','prescriptions') ORDER BY created_at DESC LIMIT 200").bind(link.clinic_id,link.patient_id).all<{id:string;module:string;data_enc:string}>()
  ]);
  const shared=[];for(const r of records.results){const data=JSON.parse(await decryptPrivate(r.data_enc)) as Record<string,unknown>;if(data.portalShared===true&&['completed','ready','issued'].includes(String(data.status))){const {patientId,portalShared,...rest}=data;void patientId;void portalShared;shared.push({id:r.id,module:r.module,...rest});}}
  profiles.push({accessId:link.access_id,clinicName:link.clinic_name,patientName:await decryptPrivate(link.full_name_enc),appointments:appointments.results,invoices:invoices.results,records:shared});
  await c.db.prepare("INSERT INTO audit_logs (id,clinic_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,'portal.viewed','patients',?)").bind(crypto.randomUUID(),link.clinic_id,c.user.userId,link.patient_id).run();
 }
 return reply({profiles});
}catch{return reply({error:'Could not load the patient portal'},503);}}

export async function POST(request:Request){try{
 const c=await currentAccountContext(request);if(!isAccountContext(c))return c;
 const d=z.object({accessId:z.string().uuid(),rating:z.number().int().min(1).max(5),comment:z.string().trim().max(2000),requestKey:z.string().uuid()}).strict().parse(await request.json());
 const link=await c.db.prepare('SELECT a.clinic_id,a.patient_id,p.email_enc FROM patient_portal_access a JOIN patients p ON p.id=a.patient_id AND p.clinic_id=a.clinic_id WHERE a.id=? AND a.email_hash=? AND a.active=1').bind(d.accessId,await sha256(c.user.email.trim().toLowerCase())).first<{clinic_id:string;patient_id:string;email_enc:string|null}>();
 if(!link||(await decryptPrivate(link.email_enc)).trim().toLowerCase()!==c.user.email.trim().toLowerCase())return reply({error:'Patient access not found'},404);
 const old=await c.db.prepare("SELECT id,patient_id FROM clinic_records WHERE id=? AND clinic_id=? AND module='feedback'").bind(d.requestKey,link.clinic_id).first<{id:string;patient_id:string}>();if(old)return old.patient_id===link.patient_id?reply({ok:true}):reply({error:'Request key reused'},409);
 if(!await workflowQuota(c.db,'feedback:'+d.accessId+':'+new Date().toISOString().slice(0,10),1))return reply({error:'One feedback submission is allowed per day'},429);
 const branch=await c.db.prepare("SELECT id FROM clinic_branches WHERE clinic_id=? AND status='active' ORDER BY is_default DESC LIMIT 1").bind(link.clinic_id).first<{id:string}>();if(!branch)return reply({error:'Clinic is unavailable'},503);
 await c.db.batch([c.db.prepare("INSERT INTO clinic_records (id,clinic_id,branch_id,module,patient_id,data_enc) VALUES (?,?,?,'feedback',?,?)").bind(d.requestKey,link.clinic_id,branch.id,link.patient_id,await encryptPrivate(JSON.stringify({patientId:link.patient_id,name:'Patient feedback',rating:d.rating,date:new Date().toISOString().slice(0,10),notes:d.comment,status:'pending'}))),c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,?,'feedback.submitted','feedback',?)").bind(crypto.randomUUID(),link.clinic_id,branch.id,c.user.userId,d.requestKey)]);
 return reply({ok:true},201);
}catch(e){return reply({error:e instanceof z.ZodError?'Check the feedback details':'Could not submit feedback'},e instanceof z.ZodError?400:503);}}
