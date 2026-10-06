import {env} from 'cloudflare:workers';
import {currentClinicContext,isClinicContext,encryptBytes,decryptBytes,encryptPrivate,decryptPrivate} from '../../../lib/clinic-runtime';
import {canAccess} from '../../../lib/ops-model';
import {validMedicalFile} from '../../../lib/file-policy';
export async function GET(request:Request){try{
 const c=await currentClinicContext(request);if(!isClinicContext(c))return c;if(!canAccess(c.role,'files'))return Response.json({error:'Access denied'},{status:403});
 const url=new URL(request.url),id=url.searchParams.get('id');
 if(!id){const patient=url.searchParams.get('patientId');const result=patient?await c.db.prepare('SELECT id,patient_id,name_enc,mime,size,created_at FROM medical_files WHERE clinic_id=? AND branch_id=? AND patient_id=? ORDER BY created_at DESC LIMIT 500').bind(c.clinicId,c.branchId,patient).all<Record<string,string|number>>():await c.db.prepare('SELECT id,patient_id,name_enc,mime,size,created_at FROM medical_files WHERE clinic_id=? AND branch_id=? ORDER BY created_at DESC LIMIT 500').bind(c.clinicId,c.branchId).all<Record<string,string|number>>();return Response.json({rows:await Promise.all(result.results.map(async r=>{const {name_enc,...v}=r;return {...v,name:await decryptPrivate(String(name_enc))};})),writable:canAccess(c.role,'files',true)},{headers:{'Cache-Control':'no-store'}});}
 const row=await c.db.prepare('SELECT object_key,name_enc,mime FROM medical_files WHERE clinic_id=? AND branch_id=? AND id=?').bind(c.clinicId,c.branchId,id).first<{object_key:string;name_enc:string;mime:string}>();if(!row)return Response.json({error:'File not found'},{status:404});
 const object=await env.BUCKET?.get(row.object_key);if(!object)return Response.json({error:'File storage unavailable'},{status:503});
 await c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,?,'file.downloaded','files',?)").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,id).run();
 return new Response(await decryptBytes(await object.arrayBuffer()),{headers:{'Content-Type':row.mime,'Content-Disposition':"attachment; filename*=UTF-8''"+encodeURIComponent(await decryptPrivate(row.name_enc)),'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
}catch{return Response.json({error:'Could not load medical file'},{status:503});}}
export async function POST(request:Request){try{
 const c=await currentClinicContext(request);if(!isClinicContext(c))return c;if(!canAccess(c.role,'files',true))return Response.json({error:'Access denied'},{status:403});
 if(!env.BUCKET)return Response.json({error:'Private file storage is not configured'},{status:503});
 if(Number(request.headers.get('content-length')??0)>6*1024*1024)return Response.json({error:'Maximum file size is 5 MB'},{status:413});
 const form=await request.formData(),file=form.get('file'),patientId=form.get('patientId');
 if(!(file instanceof File)||!file.size||file.size>5*1024*1024||typeof patientId!=='string')return Response.json({error:'Select a patient and a file up to 5 MB'},{status:400});
 if(!await c.db.prepare('SELECT id FROM patients WHERE clinic_id=? AND id=?').bind(c.clinicId,patientId).first())return Response.json({error:'Patient not found'},{status:404});
 const bytes=await file.arrayBuffer();if(!validMedicalFile(file.type,new Uint8Array(bytes)))return Response.json({error:'Only valid PDF, JPEG, PNG and WebP files are supported'},{status:400});
 const id=crypto.randomUUID(),key=c.clinicId+'/'+id;await env.BUCKET.put(key,await encryptBytes(bytes));
 try{await c.db.batch([c.db.prepare('INSERT INTO medical_files (id,clinic_id,branch_id,patient_id,name_enc,mime,size,object_key) VALUES (?,?,?,?,?,?,?,?)').bind(id,c.clinicId,c.branchId,patientId,await encryptPrivate(file.name.slice(0,200)),file.type,file.size,key),c.db.prepare("INSERT INTO audit_logs (id,clinic_id,branch_id,actor_user_id,action,resource_type,resource_id) VALUES (?,?,?,?,'file.uploaded','files',?)").bind(crypto.randomUUID(),c.clinicId,c.branchId,c.user.userId,id)]);}catch(error){await env.BUCKET.delete(key);throw error;}
 return Response.json({id},{status:201});
}catch{return Response.json({error:'Could not upload medical file'},{status:503});}}
