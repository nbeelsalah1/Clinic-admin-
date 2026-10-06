import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url),zod=pathToFileURL(require.resolve('zod')).href;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const source=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const modelUrl=url(source('../lib/ops-model.ts').replace("'zod'",JSON.stringify(zod)));
const {validateRecord,estimatedPregnancy}=await import(modelUrl);
const workflowUrl=url(source('../lib/workflow-policy.ts'));
const {validWebhookSignature,workflowQuota}=await import(workflowUrl);
const runtimeUrl=url(`export const currentClinicContext=async()=>globalThis.context;export const currentAccountContext=async()=>globalThis.account;export const isClinicContext=v=>!(v instanceof Response);export const isAccountContext=isClinicContext;export const encryptPrivate=async v=>v||null;export const decryptPrivate=async v=>v||'';export async function sha256(v){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(v)))].map(b=>b.toString(16).padStart(2,'0')).join('');}`);
const {sha256}=await import(runtimeUrl);
const envUrl=url('export const env=globalThis.workflowEnv;');
const timeUrl=url(source('../lib/clinic-time.ts'));
function route(path){return import(url(source(path).replaceAll("'zod'",JSON.stringify(zod)).replace(/['"](?:\.\.\/)+lib\/clinic-runtime['"]/g,JSON.stringify(runtimeUrl)).replace(/['"](?:\.\.\/)+lib\/ops-model['"]/g,JSON.stringify(modelUrl)).replace(/['"](?:\.\.\/)+lib\/workflow-policy['"]/g,JSON.stringify(workflowUrl)).replace(/['"](?:\.\.\/)+lib\/clinic-time['"]/g,JSON.stringify(timeUrl)).replace(/[\"']cloudflare:workers[\"']/g,JSON.stringify(envUrl))));}
globalThis.workflowEnv={};
const ops=await route('../app/api/ops/route.ts'),portal=await route('../app/api/portal/route.ts'),access=await route('../app/api/patient-access/route.ts'),booking=await route('../app/api/public/booking/route.ts'),ai=await route('../app/api/clinical-ai/route.ts'),webhook=await route('../app/api/whatsapp/webhook/route.ts'),website=await route('../app/api/clinic-website/route.ts'),publicClinic=await route('../app/api/public/clinic/route.ts');
function setup(){
 const raw=new DatabaseSync(':memory:');for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())raw.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 const db={prepare(sql){let values=[];const statement={bind(...v){values=v;return this;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};return statement;},async batch(statements){raw.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 raw.exec("INSERT INTO clinics (id,name,owner_user_id,public_slug,public_enabled,trial_ends_at) VALUES ('c1','Clinic','owner','clinic-one',1,'2099-01-01T00:00:00Z'),('c2','Other','owner2','clinic-two',1,'2099-01-01T00:00:00Z');INSERT INTO clinic_branches(id,clinic_id,name,is_default) VALUES('c1','c1','Main',1),('c2','c2','Other',1)");
 const patientId=crypto.randomUUID();raw.prepare('INSERT INTO patients(id,clinic_id,full_name_enc,phone_enc,email_enc) VALUES(?,?,?,?,?)').run(patientId,'c1','Patient One','0590000000','patient@example.com');
 globalThis.context={db,clinicId:'c1',clinicName:'Clinic',branchId:'c1',branchName:'Main',role:'clinic_admin',user:{userId:'admin',email:'admin@example.com'}};
 globalThis.account={db,user:{userId:'patient-user',email:'patient@example.com'},isSuperAdmin:false};globalThis.workflowEnv.DB=db;delete globalThis.workflowEnv.OPENAI_API_KEY;
 return {raw,db,patientId};
}
const request=data=>new Request('https://site.test/api/test',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const patchRequest=data=>new Request('https://site.test/api/clinic-website',{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});
const draft=patientId=>({patientId,name:'Exam',specialty:'ophthalmology',date:'2026-10-07',notes:'Recorded exam',plan:'Clinician plan',status:'draft',findings:{iopRight:12,iopLeft:13},teeth:{},treatments:[],vaccines:[]});
test('specialty schemas reject foreign fields, invalid measurements and dental data in other specialties',()=>{
 const d=draft(crypto.randomUUID());assert.equal(validateRecord('specialty',d).findings.iopRight,12);
 assert.throws(()=>validateRecord('specialty',{...d,findings:{iopRight:-1}}));assert.throws(()=>validateRecord('specialty',{...d,findings:{painScore:2}}));assert.throws(()=>validateRecord('specialty',{...d,teeth:{11:'caries'}}));
 assert.throws(()=>validateRecord('specialty',{...d,specialty:'dental',findings:{},teeth:{19:'caries'}}));
 assert.equal(validateRecord('specialty',{...d,specialty:'dental',findings:{},teeth:{11:'caries'},treatments:[{tooth:'11',procedure:'Recorded procedure',cost:120,status:'planned'}]}).teeth['11'],'caries');
});
test('specialty records preserve legacy notes while clinic configuration, approval and patient file boundaries apply',async()=>{
 const {raw,patientId}=setup();assert.equal((await ops.POST(request({module:'specialty',data:draft(patientId)}))).status,201);
 raw.prepare('UPDATE clinics SET enabled_specialties=? WHERE id=?').run('["dental"]','c1');assert.equal((await ops.POST(request({module:'specialty',data:draft(patientId)}))).status,409);
 raw.prepare('UPDATE clinics SET enabled_specialties=? WHERE id=?').run('["ophthalmology"]','c1');
 globalThis.context.role='nurse';assert.equal((await ops.POST(request({module:'specialty',data:{...draft(patientId),status:'completed'}}))).status,403);
 globalThis.context.role='clinic_admin';raw.prepare('UPDATE clinics SET enabled_specialties=? WHERE id=?').run('["dermatology"]','c1');
 assert.equal((await ops.POST(request({module:'specialty',data:{...draft(patientId),specialty:'dermatology',findings:{beforeFileId:crypto.randomUUID()}}}))).status,404);
});
test('LMP estimate is date-based and rejects dates preceding the recorded LMP',()=>{
 assert.deepEqual(estimatedPregnancy('2026-01-01','2026-01-15'),{weeks:2,days:0,dueDate:'2026-10-08'});assert.equal(estimatedPregnancy('2026-01-01','2025-12-31'),null);
});
test('portal exposes only explicitly shared completed records for the verified current email',async()=>{
 const {raw,patientId}=setup();assert.equal((await access.POST(request({patientId,active:true}))).status,200);
 for(const [id,shared,status] of [['private',false,'completed'],['draft',true,'draft'],['shared',true,'completed']])raw.prepare('INSERT INTO clinic_records(id,clinic_id,branch_id,module,patient_id,data_enc) VALUES(?,?,?,?,?,?)').run(id,'c1','c1','specialty',patientId,JSON.stringify({...draft(patientId),portalShared:shared,status}));
 const response=await portal.GET(new Request('https://site.test/api/portal'));assert.equal(response.status,200);const body=await response.json();assert.equal(body.profiles.length,1);assert.deepEqual(body.profiles[0].records.map(r=>r.id),['shared']);
 globalThis.account.user.email='stranger@example.com';assert.deepEqual((await (await portal.GET(new Request('https://site.test/api/portal'))).json()).profiles,[]);
 globalThis.account.user.email='patient@example.com';raw.prepare('UPDATE patients SET email_enc=? WHERE id=?').run('new@example.com',patientId);assert.deepEqual((await (await portal.GET(new Request('https://site.test/api/portal'))).json()).profiles,[]);
});
test('revocation immediately removes portal access and reception cannot create clinical access grants',async()=>{
 const {patientId}=setup();await access.POST(request({patientId,active:true}));await access.POST(request({patientId,active:false}));assert.deepEqual((await (await portal.GET(new Request('https://site.test/api/portal'))).json()).profiles,[]);
 globalThis.context.role='receptionist';assert.equal((await access.POST(request({patientId,active:true}))).status,403);
});
test('booking requests are idempotent and confirmation is linked to the request email and real appointment checks',async()=>{
 const {raw,patientId}=setup();const data={slug:'clinic-one',name:'Patient One',phone:'0590000000',service:'Visit',preferredDate:'2090-01-01',notes:'',requestKey:crypto.randomUUID()};
 const r=await booking.POST(request(data));assert.equal(r.status,201);const id=(await r.json()).id;assert.equal((await booking.POST(request(data))).status,200);assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM public_booking_requests').get().n,1);
 const doctor=(await (await ops.POST(request({module:'doctors',data:{name:'Doctor',role:'doctor',duration:20,status:'active'}}))).json()).id;
 const appointment={module:'appointments',bookingRequestId:id,data:{patientId,doctorId:doctor,service:'Visit',startsAt:'2090-01-01T08:00:00.000Z',duration:20}};
 const wrong=crypto.randomUUID();raw.prepare('INSERT INTO patients(id,clinic_id,full_name_enc,phone_enc,email_enc) VALUES(?,?,?,?,?)').run(wrong,'c1','Other Patient','0591111111','other@example.com');
 assert.equal((await ops.POST(request({...appointment,data:{...appointment.data,patientId:wrong}}))).status,409);
 assert.equal((await ops.POST(request(appointment))).status,200);assert.equal(raw.prepare('SELECT status FROM public_booking_requests WHERE id=?').get(id).status,'booked');assert.equal((await ops.POST(request(appointment))).status,409);assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM appointments').get().n,1);
});
test('webhook signatures reject tampering and rate quotas stop at the configured limit',async()=>{
 const {db}=setup();const secret='fixture-secret',body='{"event":"one"}';const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature='sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('hex');
 assert.equal(await validWebhookSignature(body,signature,secret),true);assert.equal(await validWebhookSignature(body+' ',signature,secret),false);assert.equal(await validWebhookSignature(body,null,secret),false);assert.equal(await workflowQuota(db,'bucket',2),true);assert.equal(await workflowQuota(db,'bucket',2),true);assert.equal(await workflowQuota(db,'bucket',2),false);
});
test('clinical AI cannot silently call a provider when unconfigured or from a non-clinical role',async()=>{
 setup();assert.equal((await ai.POST(request({text:'Sample clinician dictation',language:'en',consent:true}))).status,503);globalThis.context.role='accountant';assert.equal((await ai.POST(request({text:'Sample clinician dictation',language:'en',consent:true}))).status,403);
});
test('clinic SEO metadata is saved per clinic, validated and exposed only with the published profile',async()=>{
 const {raw}=setup();const values={slug:'clinic-one',description:'عيادة طب أسنان في نابلس',seoTitle:'طبيب أسنان في نابلس | عيادة النور',seoDescription:'خدمات طب الأسنان والحجز في نابلس.',phone:'+970 59 000 0000',address:'نابلس',bookingUrl:'',enabled:true};
 const saved=await website.PATCH(patchRequest(values));assert.equal(saved.status,200);const result=await saved.json();assert.equal(result.url,'https://site.test/c/clinic-one');
 assert.equal((await website.GET(new Request('https://site.test/api/clinic-website'))).status,200);const published=await publicClinic.GET(new Request('https://site.test/api/public/clinic?slug=clinic-one'));assert.equal(published.status,200);const body=await published.json();assert.equal(body.clinic.seoTitle,values.seoTitle);assert.equal(body.clinic.seoDescription,values.seoDescription);assert.equal(body.clinic.specialty,'general');
 assert.equal((await website.PATCH(patchRequest({...values,seoTitle:'x'.repeat(71)}))).status,400);globalThis.context.role='doctor';assert.equal((await website.PATCH(patchRequest(values))).status,403);
 globalThis.context.role='clinic_admin';raw.prepare('UPDATE clinics SET public_enabled=0 WHERE id=?').run('c1');assert.equal((await publicClinic.GET(new Request('https://site.test/api/public/clinic?slug=clinic-one'))).status,404);
});
test('WhatsApp signed messages are acknowledged once and a bad signature never sends a response',async t=>{
 const {raw}=setup();raw.prepare('INSERT INTO clinic_integrations(clinic_id,whatsapp_phone_id,whatsapp_token_enc,whatsapp_app_secret_enc,verify_token_hash,whatsapp_enabled) VALUES(?,?,?,?,?,1)').run('c1','123456','fixture-token','fixture-secret',await sha256('verify'));
 let sends=0;const original=globalThis.fetch;globalThis.fetch=async()=>{sends++;return Response.json({messages:[{id:'reply'}]});};t.after(()=>{globalThis.fetch=original;});
 const data={object:'whatsapp_business_account',entry:[{changes:[{value:{metadata:{phone_number_id:'123456'},messages:[{id:'message-one',from:'970599000000',type:'text',text:{body:'موقع'}}]}}]}]},body=JSON.stringify(data);const key=await crypto.subtle.importKey('raw',new TextEncoder().encode('fixture-secret'),{name:'HMAC',hash:'SHA-256'},false,['sign']);const signature='sha256='+Buffer.from(await crypto.subtle.sign('HMAC',key,new TextEncoder().encode(body))).toString('hex');
 const req=()=>new Request('https://site.test/api/whatsapp/webhook?clinic=c1',{method:'POST',body,headers:{'x-hub-signature-256':signature}});
 assert.equal((await webhook.POST(req())).status,200);assert.equal((await webhook.POST(req())).status,200);assert.equal(sends,1);assert.equal((await webhook.POST(new Request('https://site.test/api/whatsapp/webhook?clinic=c1',{method:'POST',body,headers:{'x-hub-signature-256':'sha256='+'0'.repeat(64)}}))).status,403);assert.equal(sends,1);
});

test('lab sample labels have valid checksums, persist uniquely and cannot be replaced during editing',async()=>{
 const {patientId,raw}=setup();const data={patientId,name:'Test sample',kind:'lab',date:'2026-10-07',result:'',status:'requested'};
 const r=await ops.POST(request({module:'lab',data}));assert.equal(r.status,201);const id=(await r.json()).id;
 let row=raw.prepare('SELECT data_enc FROM clinic_records WHERE id=?').get(id);const sample=JSON.parse(row.data_enc).sampleCode;const {ean13,ean13Bits}=await import(modelUrl);
 assert.equal(sample.length,13);assert.equal(ean13(sample.slice(0,12)),sample);assert.equal(ean13Bits(sample).length,95);assert.equal(ean13('400638133393'),'4006381333931');assert.throws(()=>ean13Bits('4006381333932'));
 assert.equal(raw.prepare('SELECT record_id FROM lab_samples WHERE code=?').get(sample).record_id,id);
 assert.equal((await ops.PATCH(request({module:'lab',id,version:1,data:{...data,sampleCode:'4006381333931'}}))).status,200);row=raw.prepare('SELECT data_enc FROM clinic_records WHERE id=?').get(id);assert.equal(JSON.parse(row.data_enc).sampleCode,sample);
});
