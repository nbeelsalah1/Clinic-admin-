import {z} from 'zod';
import {currentClinicContext,isClinicContext,decryptPrivate,sha256} from '../../../lib/clinic-runtime';
const reply=(body:unknown,status=200)=>Response.json(body,{status,headers:{'Cache-Control':'no-store'}});
export async function GET(request:Request){try{const c=await currentClinicContext(request);if(!isClinicContext(c))return c;if(!['clinic_admin','doctor'].includes(c.role))return reply({error:'Clinical administrator or doctor access is required'},403);return reply({rows:(await c.db.prepare('SELECT patient_id,active FROM patient_portal_access WHERE clinic_id=?').bind(c.clinicId).all()).results});}catch{return reply({error:'Could not load patient portal access'},503);}}
export async function POST(request:Request){try{
 const c=await currentClinicContext(request);if(!isClinicContext(c))return c;if(!['clinic_admin','doctor'].includes(c.role))return reply({error:'Clinical administrator or doctor access is required'},403);
 const data=z.object({patientId:z.string().uuid(),active:z.boolean()}).strict().parse(await request.json());
 const patient=await c.db.prepare('SELECT email_enc FROM patients WHERE clinic_id=? AND id=?').bind(c.clinicId,data.patientId).first<{email_enc:string|null}>();if(!patient)return reply({error:'Patient not found'},404);
 const email=await decryptPrivate(patient.email_enc);if(data.active&&!z.string().email().safeParse(email).success)return reply({error:'Save the verified patient or guardian email in the patient record first'},400);
 const hash=email?await sha256(email.trim().toLowerCase()):'';
 await c.db.batch([c.db.prepare('INSERT INTO patient_portal_access (id,clinic_id,patient_id,email_hash,active) VALUES (?,?,?,?,?) ON CONFLICT(clinic_id,patient_id) DO UPDATE SET email_hash=excluded.email_hash,active=excluded.active').bind(crypto.randomUUID(),c.clinicId,data.patientId,hash,data.active?1:0),c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,?,'portal.access.updated','patients',?)").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,data.patientId)]);
 return reply({ok:true});
}catch(e){return reply({error:e instanceof z.ZodError?'Invalid patient access request':'Could not update patient portal access'},e instanceof z.ZodError?400:503);}}
