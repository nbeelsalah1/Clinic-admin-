/* eslint-disable @next/next/no-assign-module-variable -- module identifies a validated clinic section, not a CommonJS assignment. */
import {clinicDate,clinicDayStart,followingDay} from '../../../lib/clinic-time';
import { z } from 'zod';
import { currentClinicContext, decryptPrivate, encryptPrivate, isClinicContext, type ClinicContext } from '../../../lib/clinic-runtime';
import { canAccess, ean13, invoiceTotals, moneyMinor, modules, validateRecord } from '../../../lib/ops-model';
const json=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
const fail=(message:string,status=400)=>json({error:message},status);
const uuid=z.string().uuid();
async function ownedPatient(c:ClinicContext,id:string){return c.db.prepare('SELECT id,full_name_enc FROM patients WHERE id = ? AND clinic_id = ?').bind(id,c.clinicId).first<{id:string;full_name_enc:string}>();}
function audit(c:ClinicContext,action:string,module:string,id:string){return c.db.prepare('INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,?,?,?,?)').bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,action,module,id);}
async function rows(c:ClinicContext,module:string){const result=await c.db.prepare('SELECT id,patient_id,data_enc,version,created_at FROM clinic_records WHERE clinic_id = ? AND branch_id=? AND module = ? ORDER BY created_at DESC LIMIT 1000').bind(c.clinicId,c.branchId,module).all<{id:string;patient_id:string|null;data_enc:string;version:number;created_at:string}>();return Promise.all(result.results.map(async r=>({id:r.id,version:r.version,createdAt:r.created_at,...JSON.parse(await decryptPrivate(r.data_enc))})));}
export async function GET(request:Request){try{
 const c=await currentClinicContext(request);if(!isClinicContext(c))return c;
 const url=new URL(request.url),module=url.searchParams.get('module')??'dashboard';
 if(!canAccess(c.role,module))return fail('Access denied',403);
 const writable=canAccess(c.role,module,true);
 if(module==='branches')return json({rows:(await c.db.prepare('SELECT id,name,address,phone,status,is_default FROM clinic_branches WHERE clinic_id=? ORDER BY is_default DESC,name').bind(c.clinicId).all()).results,members:(await c.db.prepare('SELECT id,email,role,active FROM clinic_memberships WHERE clinic_id=? AND active=1 ORDER BY email').bind(c.clinicId).all()).results,assignments:(await c.db.prepare('SELECT branch_id,user_id,email,active FROM clinic_branch_memberships WHERE clinic_id=? ORDER BY email').bind(c.clinicId).all()).results,writable});
 if(modules[module]){const data=await rows(c,module);if(modules[module].clinical)await audit(c,'records.viewed',module,module).run();return json({rows:data,writable});}
 if(module==='users')return json({rows:(await c.db.prepare('SELECT id,email,role,active FROM clinic_memberships WHERE clinic_id = ?').bind(c.clinicId).all()).results,writable});
 if(module==='audit')return json({rows:(await c.db.prepare('SELECT id,action,resource_type,resource_id,actor_user_id,created_at FROM audit_logs WHERE clinic_id = ? AND branch_id=? ORDER BY created_at DESC LIMIT 500').bind(c.clinicId,c.branchId).all()).results,writable:false});
 if(module==='inventory')return json({rows:(await c.db.prepare('SELECT id,name,batch,category,quantity,threshold,expires,supplier_id FROM stock_items WHERE clinic_id = ? AND branch_id=? ORDER BY name LIMIT 1000').bind(c.clinicId,c.branchId).all()).results,writable,movements:(await c.db.prepare('SELECT id,item_id,delta,reason,created_at FROM stock_movements WHERE clinic_id = ? AND branch_id=? ORDER BY created_at DESC LIMIT 200').bind(c.clinicId,c.branchId).all()).results});
 if(module==='billing'){
  const result=await c.db.prepare('SELECT * FROM invoices WHERE clinic_id = ? AND branch_id=? ORDER BY created_at DESC LIMIT 1000').bind(c.clinicId,c.branchId).all<{id:string;data_enc:string;[key:string]:unknown}>();
  return json({rows:await Promise.all(result.results.map(async r=>{const {data_enc,...v}=r;return {...v,...JSON.parse(await decryptPrivate(data_enc))};})),payments:(await c.db.prepare('SELECT id,invoice_id,amount,method,created_at FROM invoice_payments WHERE clinic_id = ? AND branch_id=? ORDER BY created_at DESC LIMIT 1000').bind(c.clinicId,c.branchId).all()).results,qreditPayments:(await c.db.prepare('SELECT id,invoice_id,amount,currency,status,provider_status,checkout_url,created_at FROM qredit_payments WHERE clinic_id=? AND branch_id=? ORDER BY created_at DESC LIMIT 500').bind(c.clinicId,c.branchId).all()).results,writable});
 }
 if(module==='patients'){
  const result=await c.db.prepare('SELECT * FROM patients WHERE clinic_id = ? ORDER BY created_at DESC LIMIT 1000').bind(c.clinicId).all<Record<string,string>>();
  const clinical=['clinic_admin','doctor','nurse'].includes(c.role);
  return json({writable,rows:await Promise.all(result.results.map(async r=>{const p:Record<string,string>={id:r.id,gender:r.gender??'',birthDate:r.birth_date??'',createdAt:r.created_at};for(const [k,col] of Object.entries({name:'full_name_enc',phone:'phone_enc',email:'email_enc',identityNumber:'identity_number_enc',address:'address_enc',...(clinical?{history:'history_enc',allergies:'allergies_enc',medications:'medications_enc'}:{})}))p[k]=await decryptPrivate(r[col]);return p;})),clinical});
 }
 if(module==='appointments'||module==='queue')return json({writable,rows:await Promise.all((await c.db.prepare('SELECT * FROM appointments WHERE clinic_id = ? AND branch_id=? ORDER BY starts_at DESC LIMIT 1000').bind(c.clinicId,c.branchId).all<Record<string,string|number>>()).results.map(async r=>{const {patient_name_enc,...rest}=r;return {...rest,name:await decryptPrivate(String(patient_name_enc))};}))});
 if(module==='dashboard'||module==='reports'){
  const from=url.searchParams.get('from')??clinicDate().slice(0,7)+'-01';const to=url.searchParams.get('to')??clinicDate();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(from)||!/^\d{4}-\d{2}-\d{2}$/.test(to)||!Number.isFinite(Date.parse(from))||!Number.isFinite(Date.parse(to))||new Date(from).toISOString().slice(0,10)!==from||new Date(to).toISOString().slice(0,10)!==to||from>to)return fail('Invalid date range');
  const start=clinicDayStart(from),end=clinicDayStart(followingDay(to));
  const count=await c.db.prepare('SELECT COUNT(*) AS patients FROM patients WHERE clinic_id = ?').bind(c.clinicId).first();
  const appointments=(await c.db.prepare('SELECT status,COUNT(*) AS count FROM appointments WHERE clinic_id = ? AND branch_id=? AND starts_at >= ? AND starts_at < ? GROUP BY status').bind(c.clinicId,c.branchId,start,end).all()).results;
  const financial=canAccess(c.role,'billing');
  const paymentRows=financial?(await c.db.prepare('SELECT created_at,amount FROM invoice_payments WHERE clinic_id = ? AND branch_id=? AND datetime(created_at) >= datetime(?) AND datetime(created_at) < datetime(?) ORDER BY created_at').bind(c.clinicId,c.branchId,start,end).all<{created_at:string;amount:number}>()).results:[];
  const totals=new Map<string,number>();for(const r of paymentRows){const date=clinicDate(r.created_at.replace(' ','T')+'Z');totals.set(date,(totals.get(date)??0)+r.amount);}const daily=[...totals].map(([date,amount])=>({date,amount}));
  const debt=financial?await c.db.prepare("SELECT COALESCE(SUM(total-paid),0) AS amount FROM invoices WHERE clinic_id = ? AND branch_id=? AND status != 'void'").bind(c.clinicId,c.branchId).first<{amount:number}>():null;
  const expenseRows=canAccess(c.role,'expenses')?(await c.db.prepare("SELECT data_enc FROM clinic_records WHERE clinic_id=? AND branch_id=? AND module='expenses'").bind(c.clinicId,c.branchId).all<{data_enc:string}>()).results:[];
  const expenseData=await Promise.all(expenseRows.map(async r=>JSON.parse(await decryptPrivate(r.data_enc))));
  const expenses=canAccess(c.role,'expenses')?expenseData.filter(r=>r.date>=from&&r.date<=to).reduce((n,r)=>n+moneyMinor(r.amount),0):null;
  const lab=canAccess(c.role,'lab')?await c.db.prepare("SELECT COUNT(*) AS count FROM clinic_records WHERE clinic_id = ? AND branch_id=? AND module = 'lab'").bind(c.clinicId,c.branchId).first():null;
  const stock=canAccess(c.role,'inventory')?await c.db.prepare('SELECT COUNT(*) AS count FROM stock_items WHERE clinic_id = ? AND branch_id=? AND (quantity <= threshold OR expires <= ?)').bind(c.clinicId,c.branchId,new Date(Date.now()+60*86400000).toISOString().slice(0,10)).first():null;
  const services=(await c.db.prepare("SELECT service,COUNT(*) AS count FROM appointments WHERE clinic_id = ? AND branch_id=? AND status != 'cancelled' AND starts_at >= ? AND starts_at < ? GROUP BY service ORDER BY count DESC LIMIT 10").bind(c.clinicId,c.branchId,start,end).all()).results;
  const [newPatients,returningPatients,doctorActivity]=await Promise.all([
   c.db.prepare('SELECT COUNT(*) AS count FROM patients WHERE clinic_id=? AND datetime(created_at)>=datetime(?) AND datetime(created_at)<datetime(?)').bind(c.clinicId,start,end).first<{count:number}>(),
   c.db.prepare("SELECT COUNT(DISTINCT a.patient_id) AS count FROM appointments a JOIN patients p ON p.id=a.patient_id AND p.clinic_id=a.clinic_id WHERE a.clinic_id=? AND a.branch_id=? AND a.starts_at>=? AND a.starts_at<? AND a.status='completed' AND datetime(p.created_at)<datetime(?)").bind(c.clinicId,c.branchId,start,end,start).first<{count:number}>(),
   c.db.prepare("SELECT doctor_id,MAX(doctor_name) AS doctor_name,COUNT(*) AS visits,SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END) AS completed FROM appointments WHERE clinic_id=? AND branch_id=? AND starts_at>=? AND starts_at<? AND status!='cancelled' GROUP BY doctor_id ORDER BY visits DESC LIMIT 10").bind(c.clinicId,c.branchId,start,end).all()
  ]);
  const outcomes=appointments as {status:string;count:number}[];const statusCount=(status:string)=>Number(outcomes.find(r=>r.status===status)?.count??0);const totalAppointments=outcomes.reduce((n,r)=>n+Number(r.count),0);const observed=statusCount('completed')+statusCount('no_show');
  const paidPatients=financial?await c.db.prepare('SELECT COUNT(DISTINCT i.patient_id) AS count FROM invoice_payments p JOIN invoices i ON i.id=p.invoice_id AND i.clinic_id=p.clinic_id WHERE p.clinic_id=? AND p.branch_id=? AND datetime(p.created_at)>=datetime(?) AND datetime(p.created_at)<datetime(?)').bind(c.clinicId,c.branchId,start,end).first<{count:number}>():null;
  const revenue=financial?daily.reduce((n,r)=>n+r.amount,0):null;
  return json({from,to,patients:count?.patients??0,appointments,daily,revenue,debt:debt?.amount??null,expenses,lab:lab?.count??null,stock:stock?.count??null,services,newPatients:newPatients?.count??0,returningPatients:returningPatients?.count??0,noShowRate:observed?Math.round(statusCount('no_show')/observed*100):null,cancellationRate:totalAppointments?Math.round(statusCount('cancelled')/totalAppointments*100):null,averageCollection:paidPatients?.count?Math.round((revenue??0)/paidPatients.count):null,doctorActivity:doctorActivity.results,writable:false});
 }
 return fail('Unknown module',404);
}catch{ return fail('Could not load clinic records',503);}}
export async function POST(request:Request){return mutate(request,false);}
export async function PATCH(request:Request){return mutate(request,true);}
async function mutate(request:Request,editing:boolean){try{
 const c=await currentClinicContext(request);if(!isClinicContext(c))return c;
 if(Number(request.headers.get('content-length')??0)>100000)return fail('Request too large',413);
 const body=z.record(z.any()).parse(await request.json());const module=String(body.module??'');if(!canAccess(c.role,module,true))return fail('Access denied',403);
 let id=editing?uuid.parse(body.id):crypto.randomUUID();
 let bookingRequestId:string|null=null;
 if(module==='appointments'&&!editing&&body.bookingRequestId){bookingRequestId=uuid.parse(body.bookingRequestId);id=bookingRequestId;}
 if(module==='branches'){
  if(c.role!=='clinic_admin')return fail('Only a clinic administrator can manage branches',403);
  if(body.action==='assign'){
   const d=z.object({branchId:uuid,memberId:uuid,active:z.boolean().default(true)}).parse(body.data);
   const [branch,member]=await Promise.all([c.db.prepare('SELECT id FROM clinic_branches WHERE clinic_id=? AND id=? AND status=\'active\'').bind(c.clinicId,d.branchId).first(),c.db.prepare('SELECT id,user_id,email FROM clinic_memberships WHERE clinic_id=? AND id=? AND active=1').bind(c.clinicId,d.memberId).first<{id:string;user_id:string;email:string}>()]);if(!branch||!member)return fail('Branch or active member not found',404);
   await c.db.prepare('INSERT INTO clinic_branch_memberships (id,clinic_id,branch_id,user_id,email,active) VALUES (?,?,?,?,?,?) ON CONFLICT(clinic_id,branch_id,user_id) DO UPDATE SET email=excluded.email,active=excluded.active').bind(crypto.randomUUID(),c.clinicId,d.branchId,member.user_id,member.email,d.active?1:0).run();return json({ok:true});
  }
  const d=z.object({name:z.string().trim().min(1).max(160),address:z.string().trim().min(1).max(500),phone:z.string().trim().max(40).optional().default(''),status:z.enum(['active','inactive']).default('active')}).strict().parse(body.data);
  if(editing){const branch=await c.db.prepare('SELECT id,is_default FROM clinic_branches WHERE clinic_id=? AND id=?').bind(c.clinicId,id).first<{id:string;is_default:number}>();if(!branch)return fail('Branch not found',404);if(branch.is_default&&d.status==='inactive')return fail('The main branch must remain active',409);await c.db.prepare('UPDATE clinic_branches SET name=?,address=?,phone=?,status=? WHERE clinic_id=? AND id=?').bind(d.name,d.address,d.phone,d.status,c.clinicId,id).run();return json({id});}
  await c.db.prepare('INSERT INTO clinic_branches (id,clinic_id,name,address,phone,status,is_default) VALUES (?,?,?,?,?,?,0)').bind(id,c.clinicId,d.name,d.address,d.phone,d.status).run();return json({id},201);
 }
 if(module==='patients'){
  const clinical=['clinic_admin','doctor'].includes(c.role);
  const d=z.object({name:z.string().trim().min(1).max(160),phone:z.string().trim().min(5).max(40),email:z.union([z.literal(''),z.string().email()]).optional(),identityNumber:z.string().max(40).optional(),address:z.string().max(500).optional(),gender:z.enum(['male','female','other','']).optional(),birthDate:z.union([z.literal(''),z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]).optional(),history:z.string().max(12000).optional(),allergies:z.string().max(12000).optional(),medications:z.string().max(12000).optional()}).strict().parse(body.data);
  if(!clinical&&['history','allergies','medications'].some(k=>k in body.data))return fail('Clinical fields require a clinical role',403);
  if(editing&&!await ownedPatient(c,id))return fail('Patient not found',404);
  const enc=await Promise.all([d.name,d.phone,d.email,d.identityNumber,d.address,d.history,d.allergies,d.medications].map(encryptPrivate));
  let statement;
  if(editing){statement=clinical?c.db.prepare('UPDATE patients SET full_name_enc=?,phone_enc=?,email_enc=?,identity_number_enc=?,address_enc=?,history_enc=?,allergies_enc=?,medications_enc=?,gender=?,birth_date=?,updated_at=CURRENT_TIMESTAMP WHERE clinic_id=? AND id=?').bind(...enc,d.gender??null,d.birthDate||null,c.clinicId,id):c.db.prepare('UPDATE patients SET full_name_enc=?,phone_enc=?,email_enc=?,identity_number_enc=?,address_enc=?,gender=?,birth_date=?,updated_at=CURRENT_TIMESTAMP WHERE clinic_id=? AND id=?').bind(...enc.slice(0,5),d.gender??null,d.birthDate||null,c.clinicId,id);}
  else statement=c.db.prepare('INSERT INTO patients (id,clinic_id,full_name_enc,phone_enc,email_enc,identity_number_enc,address_enc,history_enc,allergies_enc,medications_enc,gender,birth_date) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,c.clinicId,...enc,d.gender??null,d.birthDate||null);
  await c.db.batch([statement,audit(c,editing?'patient.updated':'patient.created',module,id)]);return json({id},editing?200:201);
 }
 if(module==='appointments'){
  if(editing&&body.action==='status'){
   const status=z.enum(['upcoming','waiting','completed','cancelled','no_show']).parse(body.status);
   // Cancelled slots cannot be reactivated through the status shortcut.
   const result=await c.db.batch([c.db.prepare("UPDATE appointments SET status=? WHERE clinic_id=? AND branch_id=? AND id=? AND status != 'cancelled'").bind(status,c.clinicId,c.branchId,id),c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,?,'appointment.status','appointments',? WHERE changes()>0").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,id)]);return result[0].meta.changes?json({ok:true}):fail('Appointment unavailable',409);
  }
  const d=z.object({patientId:uuid,doctorId:uuid,service:z.string().trim().min(1).max(120),startsAt:z.string().datetime(),duration:z.number().int().min(5).max(480)}).parse(body.data);
  const patient=await ownedPatient(c,d.patientId);if(!patient)return fail('Patient not found',404);
  if(bookingRequestId){const pending=await c.db.prepare("SELECT id,email_hash FROM public_booking_requests WHERE id=? AND clinic_id=? AND status IN ('pending','contacted')").bind(bookingRequestId,c.clinicId).first<{id:string;email_hash:string}>();if(!pending)return fail('Booking request no longer available',409);const row=await c.db.prepare('SELECT email_enc FROM patients WHERE id=? AND clinic_id=?').bind(d.patientId,c.clinicId).first<{email_enc:string}>();const email=(await decryptPrivate(row?.email_enc??null)).trim().toLowerCase();const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(email));const hash=[...new Uint8Array(digest)].map(v=>v.toString(16).padStart(2,'0')).join('');if(hash!==pending.email_hash)return fail('Select the patient with the verified request email',409);}
  const doctorRow=await c.db.prepare("SELECT data_enc FROM clinic_records WHERE clinic_id=? AND branch_id=? AND id=? AND module='doctors'").bind(c.clinicId,c.branchId,d.doctorId).first<{data_enc:string}>();if(!doctorRow)return fail('Doctor not found',404);
  const doctor=JSON.parse(await decryptPrivate(doctorRow.data_enc));if(doctor.role!=='doctor'||doctor.status!=='active')return fail('Doctor is inactive',409);
  const local=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hebron',weekday:'short',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(new Date(d.startsAt));
  const part=(type:string)=>local.find(p=>p.type===type)?.value??'';const weekday=['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(part('weekday'));const clock=part('hour')+':'+part('minute');
  if(doctor.workingDays&&!String(doctor.workingDays).split(',').includes(String(weekday)))return fail('Doctor is not working on this day',409);
  const localEnd=new Intl.DateTimeFormat('en-GB',{timeZone:'Asia/Hebron',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(Date.parse(d.startsAt)+d.duration*60000));
  if(doctor.start&&doctor.end&&(clock<doctor.start||localEnd>doctor.end||localEnd<=clock))return fail('Appointment is outside working hours',409);
  const localDate=new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Hebron',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(d.startsAt));
  const leaveRows=(await c.db.prepare("SELECT data_enc FROM clinic_records WHERE clinic_id=? AND branch_id=? AND module='attendance'").bind(c.clinicId,c.branchId).all<{data_enc:string}>()).results;
  for(const row of leaveRows){const leave=JSON.parse(await decryptPrivate(row.data_enc));if(leave.employeeId===d.doctorId&&leave.date===localDate&&leave.kind==='leave'&&leave.status==='approved')return fail('Doctor has approved leave',409);}
  const start=new Date(d.startsAt).toISOString(),end=new Date(Date.parse(start)+d.duration*60000).toISOString();
  if(editing&&!await c.db.prepare("SELECT id FROM appointments WHERE clinic_id=? AND branch_id=? AND id=? AND status != 'cancelled'").bind(c.clinicId,c.branchId,id).first())return fail('Appointment not found',404);
  const condition="NOT EXISTS (SELECT 1 FROM appointments WHERE clinic_id=? AND branch_id=? AND (doctor_id=? OR (doctor_id IS NULL AND doctor_name=?)) AND id!=? AND status!='cancelled' AND unixepoch(starts_at)<unixepoch(?) AND unixepoch(starts_at)+duration_minutes*60>unixepoch(?))";
  const statement=editing?c.db.prepare('UPDATE appointments SET patient_id=?,patient_name_enc=?,service=?,doctor_name=?,doctor_id=?,starts_at=?,duration_minutes=? WHERE clinic_id=? AND branch_id=? AND id=? AND '+condition).bind(d.patientId,patient.full_name_enc,d.service,doctor.name,d.doctorId,start,d.duration,c.clinicId,c.branchId,id,c.clinicId,c.branchId,d.doctorId,doctor.name,id,end,start):c.db.prepare('INSERT OR IGNORE INTO appointments (id,clinic_id,branch_id,patient_id,patient_name_enc,service,doctor_name,doctor_id,starts_at,duration_minutes,status) SELECT ?,?,?,?,?,?,?,?,?,?,\'upcoming\' WHERE '+condition).bind(id,c.clinicId,c.branchId,d.patientId,patient.full_name_enc,d.service,doctor.name,d.doctorId,start,d.duration,c.clinicId,c.branchId,d.doctorId,doctor.name,id,end,start);
  const result=await c.db.batch([statement,c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,?, 'appointment.saved','appointments',? WHERE changes()>0").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,id),...(bookingRequestId?[c.db.prepare("UPDATE public_booking_requests SET status='booked' WHERE clinic_id=? AND id=? AND EXISTS (SELECT 1 FROM appointments WHERE id=? AND clinic_id=?)").bind(c.clinicId,bookingRequestId,id,c.clinicId)]:[])]);return result[0].meta.changes?json({id}):fail('Doctor has an overlapping appointment or request already booked',409);
 }
 if(modules[module]){
  if(editing){const old=await c.db.prepare('SELECT id,version FROM clinic_records WHERE clinic_id = ? AND branch_id=? AND module = ? AND id = ?').bind(c.clinicId,c.branchId,module,id).first<{id:string;version:number}>();if(!old)return fail('Record not found',404);if(old.version!==body.version)return fail('Record changed. Refresh before saving.',409);}
  const data=validateRecord(module,body.data);
  if(data.portalShared&&!['clinic_admin','doctor'].includes(c.role))return fail('A clinician must share medical records',403);
  if(data.patientId&&!await ownedPatient(c,String(data.patientId)))return fail('Patient not found',404);
  for(const [key,kind] of [['employeeId','doctors'],['supplierId','suppliers']])if(data[key]&&!await c.db.prepare('SELECT id FROM clinic_records WHERE clinic_id = ? AND branch_id=? AND module = ? AND id = ?').bind(c.clinicId,c.branchId,kind,data[key]).first())return fail('Linked record not found',404);
  if(['waitlist','commissions'].includes(module)&&data.employeeId){
   const linked=await c.db.prepare("SELECT data_enc FROM clinic_records WHERE clinic_id=? AND branch_id=? AND module='doctors' AND id=?").bind(c.clinicId,c.branchId,data.employeeId).first<{data_enc:string}>();
   const doctor=linked?JSON.parse(await decryptPrivate(linked.data_enc)):null;
   if(doctor?.role!=='doctor'||doctor?.status!=='active')return fail('Choose an active doctor',409);
  }
  if(module==='specialty'){
   const config=await c.db.prepare('SELECT enabled_specialties FROM clinics WHERE id=?').bind(c.clinicId).first<{enabled_specialties:string}>();
   if(!editing&&config&&!JSON.parse(config.enabled_specialties).includes(data.specialty))return fail('Specialty is disabled for this clinic',409);
   if(c.role==='nurse'&&(data.status==='completed'||data.portalShared))return fail('A clinician must approve and share the record',403);
   if(c.role==='nurse'&&editing){const old=await c.db.prepare('SELECT data_enc FROM clinic_records WHERE clinic_id=? AND branch_id=? AND module=? AND id=?').bind(c.clinicId,c.branchId,module,id).first<{data_enc:string}>();if(old&&JSON.parse(await decryptPrivate(old.data_enc)).status==='completed')return fail('Approved records require a clinician',403);}
   const findings=data.findings as unknown as Record<string,unknown>|undefined;
   for(const key of ['beforeFileId','afterFileId'])if(findings?.[key]&&!await c.db.prepare("SELECT id FROM medical_files WHERE clinic_id=? AND branch_id=? AND patient_id=? AND id=? AND mime LIKE 'image/%'").bind(c.clinicId,c.branchId,data.patientId,findings[key]).first())return fail('Image must belong to this patient and branch',404);
  }
  if(module==='consents'&&editing){const prior=await c.db.prepare('SELECT data_enc FROM clinic_records WHERE clinic_id=? AND branch_id=? AND module=? AND id=?').bind(c.clinicId,c.branchId,module,id).first<{data_enc:string}>();if(prior){const previous=JSON.parse(await decryptPrivate(prior.data_enc));if(['signed','withdrawn'].includes(previous.status)&&(data.status!=='withdrawn'||Object.keys(previous).some(k=>k!=='status'&&previous[k]!==data[k])))return fail('Signed consents are immutable; withdraw or create a new consent',409);}}
  if(module==='lab'){
   if(editing){const prior=await c.db.prepare('SELECT data_enc FROM clinic_records WHERE clinic_id=? AND branch_id=? AND module=? AND id=?').bind(c.clinicId,c.branchId,module,id).first<{data_enc:string}>();const sample=prior?JSON.parse(await decryptPrivate(prior.data_enc)).sampleCode:null;if(sample)data.sampleCode=sample;else delete data.sampleCode;}
   else data.sampleCode=ean13('20'+[...crypto.getRandomValues(new Uint8Array(10))].map(v=>v%10).join(''));
  }
  const encrypted=await encryptPrivate(JSON.stringify(data));
  if(editing){const result=await c.db.batch([c.db.prepare('UPDATE clinic_records SET data_enc = ?,patient_id = ?,version = version+1,updated_at = CURRENT_TIMESTAMP WHERE clinic_id = ? AND branch_id=? AND module = ? AND id = ? AND version = ?').bind(encrypted,data.patientId??null,c.clinicId,c.branchId,module,id,body.version),c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,?,'record.updated',?,? WHERE changes() > 0").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,module,id)]);if(!result[0].meta.changes)return fail('Record changed. Refresh before saving.',409);}
  else await c.db.batch([c.db.prepare('INSERT INTO clinic_records (id,clinic_id,branch_id,module,patient_id,data_enc) VALUES (?,?,?,?,?,?)').bind(id,c.clinicId,c.branchId,module,data.patientId??null,encrypted),...(module==='lab'?[c.db.prepare('INSERT INTO lab_samples (code,clinic_id,record_id) VALUES (?,?,?)').bind(data.sampleCode,c.clinicId,id)]:[]),audit(c,'record.created',module,id)]);
  return json({id},editing?200:201);
 }
 if(module==='billing'){
  if(!editing){const patientId=uuid.parse(body.data.patientId);const patient=await ownedPatient(c,patientId);if(!patient)return fail('Patient not found',404);
   const data=z.object({patientId:uuid,lines:z.array(z.object({name:z.string().trim().min(1).max(300),qty:z.number().int().positive(),price:z.number().nonnegative()})).min(1).max(50),taxBps:z.number().int().min(0).max(10000),dueDate:z.string().regex(/^\d{4}-\d{2}-\d{2}$/),notes:z.string().max(4000).optional()}).parse(body.data);
   const clinicSettings=await c.db.prepare('SELECT contact_phone,contact_email,contact_address,invoice_prefix,invoice_footer FROM clinics WHERE id=?').bind(c.clinicId).first<{contact_phone:string;contact_email:string;contact_address:string;invoice_prefix:string;invoice_footer:string}>();
   const totals=invoiceTotals(data.lines,data.taxBps),prefix=clinicSettings?.invoice_prefix||'INV',number=prefix+'-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+id.slice(0,8).toUpperCase();
   await c.db.batch([c.db.prepare('INSERT INTO invoices (id,clinic_id,branch_id,patient_id,number,data_enc,subtotal,tax,total) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,c.clinicId,c.branchId,patientId,number,await encryptPrivate(JSON.stringify({...data,patientName:await decryptPrivate(patient.full_name_enc),clinicName:c.clinicName,clinicPhone:clinicSettings?.contact_phone??'',clinicEmail:clinicSettings?.contact_email??'',clinicAddress:clinicSettings?.contact_address??'',invoiceFooter:clinicSettings?.invoice_footer??'',branchName:c.branchName})),totals.subtotal,totals.taxAmount,totals.total),audit(c,'invoice.created',module,id)]);return json({id},201);
  }
  if(body.action==='void'){
   const result=await c.db.batch([c.db.prepare("UPDATE invoices SET status = 'void' WHERE clinic_id = ? AND branch_id=? AND id = ? AND paid = 0 AND status != 'void'").bind(c.clinicId,c.branchId,id),c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,?,'invoice.void',?,? WHERE changes() > 0").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,module,id)]);return result[0].meta.changes?json({ok:true}):fail('Only an unpaid invoice can be voided',409);
  }
  const amount=moneyMinor(body.amount);if(!amount)return fail('Payment must be positive');const method=z.enum(['cash','card','bank','wallet']).parse(body.method);const requestKey=uuid.parse(body.requestKey);const paymentId=crypto.randomUUID();
  const existing=await c.db.prepare('SELECT invoice_id,amount,method FROM invoice_payments WHERE clinic_id = ? AND branch_id=? AND request_key = ?').bind(c.clinicId,c.branchId,requestKey).first<{invoice_id:string;amount:number;method:string}>();if(existing)return existing.invoice_id===id&&existing.amount===amount&&existing.method===method?json({ok:true}):fail('Request key reused',409);
  const result=await c.db.batch([
   c.db.prepare("INSERT OR IGNORE INTO invoice_payments (id,clinic_id,branch_id,invoice_id,amount,method,request_key) SELECT ?,clinic_id,branch_id,id,?,?,? FROM invoices WHERE clinic_id = ? AND branch_id=? AND id = ? AND status != 'void' AND total-paid >= ?").bind(paymentId,amount,method,requestKey,c.clinicId,c.branchId,id,amount),
   c.db.prepare("UPDATE invoices SET paid = paid + ?,status = CASE WHEN paid + ? >= total THEN 'paid' ELSE 'issued' END WHERE clinic_id = ? AND branch_id=? AND id = ? AND EXISTS (SELECT 1 FROM invoice_payments WHERE id = ?)").bind(amount,amount,c.clinicId,c.branchId,id,paymentId),
   c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,?,'payment.created','billing',? WHERE EXISTS (SELECT 1 FROM invoice_payments WHERE id = ?)").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,id,paymentId)
  ]);return result[0].meta.changes?json({ok:true}):fail('Payment exceeds outstanding balance or invoice unavailable',409);
 }
 if(module==='inventory'){
  if(!editing){const d=z.object({name:z.string().trim().min(1).max(200),batch:z.string().trim().min(1).max(100),category:z.enum(['medicine','supply']).default('supply'),threshold:z.number().int().min(0).max(1000000),expires:z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),supplierId:z.string().optional()}).parse(body.data);
   if(d.supplierId&&!await c.db.prepare("SELECT id FROM clinic_records WHERE clinic_id = ? AND branch_id=? AND module = 'suppliers' AND id = ?").bind(c.clinicId,c.branchId,d.supplierId).first())return fail('Supplier not found',404);
   await c.db.batch([c.db.prepare('INSERT INTO stock_items (id,clinic_id,branch_id,name,batch,category,threshold,expires,supplier_id) VALUES (?,?,?,?,?,?,?,?,?)').bind(id,c.clinicId,c.branchId,d.name,d.batch,d.category,d.threshold,d.expires??null,d.supplierId??null),audit(c,'stock.created',module,id)]);return json({id},201);
  }
  const delta=z.number().int().min(-1000000).max(1000000).refine(v=>v!==0).parse(body.delta),reason=z.string().trim().min(1).max(300).parse(body.reason),requestKey=uuid.parse(body.requestKey),movementId=crypto.randomUUID();
  const old=await c.db.prepare('SELECT item_id,delta,reason FROM stock_movements WHERE clinic_id = ? AND branch_id=? AND request_key = ?').bind(c.clinicId,c.branchId,requestKey).first<{item_id:string;delta:number;reason:string}>();if(old)return old.item_id===id&&old.delta===delta&&old.reason===reason?json({ok:true}):fail('Request key reused',409);
  const result=await c.db.batch([
   c.db.prepare('INSERT OR IGNORE INTO stock_movements (id,clinic_id,branch_id,item_id,delta,reason,request_key) SELECT ?,clinic_id,branch_id,id,?,?,? FROM stock_items WHERE clinic_id = ? AND branch_id=? AND id = ? AND quantity + ? BETWEEN 0 AND 1000000').bind(movementId,delta,reason,requestKey,c.clinicId,c.branchId,id,delta),
   c.db.prepare('UPDATE stock_items SET quantity = quantity + ? WHERE clinic_id = ? AND branch_id=? AND id = ? AND EXISTS (SELECT 1 FROM stock_movements WHERE id = ?)').bind(delta,c.clinicId,c.branchId,id,movementId),
   c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) SELECT ?,?,?,?,'stock.moved','inventory',? WHERE EXISTS (SELECT 1 FROM stock_movements WHERE id = ?)").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,id,movementId)
  ]);return result[0].meta.changes?json({ok:true}):fail('Insufficient stock or item unavailable',409);
 }
 if(module==='users'){
  const data=z.object({email:z.string().email().max(254),role:z.enum(['clinic_admin','doctor','nurse','receptionist','accountant']),active:z.boolean()}).parse(body.data);
  if(editing){const target=await c.db.prepare('SELECT user_id FROM clinic_memberships WHERE clinic_id = ? AND id = ?').bind(c.clinicId,id).first<{user_id:string}>();if(!target)return fail('Member not found',404);const owner=await c.db.prepare('SELECT owner_user_id FROM clinics WHERE id = ?').bind(c.clinicId).first<{owner_user_id:string}>();if(target.user_id===c.user.userId||target.user_id===owner?.owner_user_id)return fail('Owner and your own membership are protected',409);
   await c.db.batch([c.db.prepare('UPDATE clinic_memberships SET role = ?,active = ? WHERE clinic_id = ? AND id = ?').bind(data.role,data.active?1:0,c.clinicId,id),audit(c,'member.updated',module,id)]);
  }else{if(await c.db.prepare('SELECT id FROM clinic_memberships WHERE clinic_id = ? AND lower(email) = lower(?)').bind(c.clinicId,data.email).first())return fail('Member already exists',409);await c.db.batch([c.db.prepare('INSERT INTO clinic_memberships (id,clinic_id,user_id,email,role,active) VALUES (?,?,?,?,?,?)').bind(id,c.clinicId,'invite:'+id,data.email.toLowerCase(),data.role,data.active?1:0),audit(c,'member.invited',module,id)]);}
  return json({ok:true});
 }
 return fail('Unknown operation',400);
}catch(error){if(error instanceof z.ZodError)return fail('Invalid fields: '+error.issues.map(i=>i.path.join('.')).join(', '));if(error instanceof Error&&/Invalid invoice|Invoice exceeds|valid amount/.test(error.message))return fail(error.message);return fail('Could not save record',503);}}
