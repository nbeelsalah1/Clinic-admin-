import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import ts from 'typescript';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require=createRequire(import.meta.url);
const zod=pathToFileURL(require.resolve('zod')).href;
const url=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const source=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const modelUrl=url(source('../lib/ops-model.ts').replace("'zod'",JSON.stringify(zod)));
const {canAccess,invoiceTotals,csvCell}=await import(modelUrl);
const runtime=url(`export async function currentClinicContext(){return globalThis.testClinicContext;}export const isClinicContext=v=>!(v instanceof Response);export async function encryptPrivate(v){return v||null;}export async function decryptPrivate(v){return v||'';}`);
const timeUrl=url(source('../lib/clinic-time.ts'));
const routeUrl=url(source('../app/api/ops/route.ts').replace("'zod'",JSON.stringify(zod)).replace("'../../../lib/clinic-runtime'",JSON.stringify(runtime)).replace("'../../../lib/ops-model'",JSON.stringify(modelUrl)).replace("'../../../lib/clinic-time'",JSON.stringify(timeUrl)));
const {POST,PATCH,GET}=await import(routeUrl);
const {validMedicalFile}=await import(url(source('../lib/file-policy.ts')));
function setup(role='clinic_admin'){
 const raw=new DatabaseSync(':memory:');const dir=new URL('../drizzle/',import.meta.url);for(const f of readdirSync(dir).filter(f=>f.endsWith('.sql')).sort())raw.exec(readFileSync(new URL(f,dir),'utf8'));
 const db={prepare(sql){let values=[];const statement={bind(...v){values=v;return this;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){const result=raw.prepare(sql).run(...values);return {meta:{changes:Number(result.changes)}};}};return statement;},async batch(statements){raw.exec('BEGIN');try{const r=[];for(const s of statements)r.push(await s.run());raw.exec('COMMIT');return r;}catch(e){raw.exec('ROLLBACK');throw e;}}};
 raw.exec("INSERT INTO clinics(id,name,owner_user_id) VALUES('c1','Clinic 1','u1'),('c2','Clinic 2','u2')");
 raw.prepare("INSERT INTO clinic_branches(id,clinic_id,name,address,phone,status,is_default) VALUES('c1','c1','Main','','','active',1),('c2','c2','Main','','','active',1)").run();
 const patient=crypto.randomUUID(),foreign=crypto.randomUUID();raw.prepare('INSERT INTO patients(id,clinic_id,full_name_enc,phone_enc) VALUES(?,?,?,?)').run(patient,'c1','Patient','0590000000');raw.prepare('INSERT INTO patients(id,clinic_id,full_name_enc,phone_enc) VALUES(?,?,?,?)').run(foreign,'c2','Private','0590000001');
 globalThis.testClinicContext={db,clinicId:'c1',clinicName:'Clinic 1',branchId:'c1',branchName:'Main',role,user:{userId:'u1',email:'admin@example.com'}};return {raw,patient,foreign};
}
const request=(body)=>new Request('https://clinic.test/api/ops',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
const invoice=(patient)=>({module:'billing',data:{patientId:patient,lines:[{name:'Visit',qty:2,price:10.25}],taxBps:1600,dueDate:'2026-10-01'}});
test('financial totals retain agorot and CSV neutralizes spreadsheet formulas',()=>{assert.deepEqual(invoiceTotals([{name:'a',qty:2,price:10.25}],1600),{subtotal:2050,taxAmount:328,total:2378});assert.throws(()=>invoiceTotals([{name:'a',qty:1,price:1.001}],0));assert.equal(csvCell('=HYPERLINK("evil")'),'"\'=HYPERLINK(""evil"")"');});
test('RBAC protects medical, financial and administration modules',()=>{assert.equal(canAccess('accountant','lab'),false);assert.equal(canAccess('receptionist','prescriptions'),false);assert.equal(canAccess('doctor','users',true),false);assert.equal(canAccess('doctor','doctors',true),false);assert.equal(canAccess('clinic_admin','users',true),true);});
test('patient save and edit persist fields while foreign patient writes fail',async()=>{const {raw,foreign}=setup();const r=await POST(request({module:'patients',data:{name:'سارة',phone:'0591234567',history:'History',allergies:'Penicillin',gender:'female',birthDate:'1990-04-03'}}));assert.equal(r.status,201);const id=(await r.json()).id;assert.equal(raw.prepare('SELECT full_name_enc FROM patients WHERE id=?').get(id).full_name_enc,'سارة');assert.equal((await PATCH(request({module:'patients',id:foreign,data:{name:'Leak',phone:'0591234567'}}))).status,404);assert.equal(raw.prepare('SELECT full_name_enc FROM patients WHERE id=?').get(foreign).full_name_enc,'Private');});
test('foreign patient cannot be attached to lab or invoice; optimistic edits reject stale versions',async()=>{const {foreign,patient}=setup();assert.equal((await POST(request(invoice(foreign)))).status,404);const data={patientId:foreign,name:'CBC',kind:'lab',date:'2026-09-30',result:'',status:'requested'};assert.equal((await POST(request({module:'lab',data}))).status,404);data.patientId=patient;const r=await POST(request({module:'lab',data}));const id=(await r.json()).id;assert.equal((await PATCH(request({module:'lab',id,version:1,data:{...data,status:'ready',result:'Result'}}))).status,200);assert.equal((await PATCH(request({module:'lab',id,version:1,data}))).status,409);});
test('payments cannot overpay, repeat, or change an idempotent request; paid invoices cannot be voided',async()=>{const {raw,patient}=setup();const id=(await (await POST(request(invoice(patient)))).json()).id;const key=crypto.randomUUID();const payment={module:'billing',id,amount:20,method:'cash',requestKey:key};assert.equal((await PATCH(request(payment))).status,200);assert.equal((await PATCH(request(payment))).status,200);assert.equal((await PATCH(request({...payment,amount:19}))).status,409);assert.equal((await PATCH(request({...payment,requestKey:crypto.randomUUID(),amount:4}))).status,409);assert.equal(raw.prepare('SELECT paid FROM invoices WHERE id=?').get(id).paid,2000);assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM invoice_payments').get().n,1);assert.equal((await PATCH(request({module:'billing',id,action:'void'}))).status,409);});
test('stock ledger rejects negative quantity, foreign movements and duplicate debits',async()=>{const {raw}=setup();const id=(await (await POST(request({module:'inventory',data:{name:'Gauze',batch:'B1',threshold:2}}))).json()).id;const move={module:'inventory',id,delta:10,reason:'Purchase',requestKey:crypto.randomUUID()};assert.equal((await PATCH(request(move))).status,200);assert.equal((await PATCH(request(move))).status,200);assert.equal((await PATCH(request({...move,delta:-11,requestKey:crypto.randomUUID()}))).status,409);assert.equal((await PATCH(request({...move,delta:-3,requestKey:crypto.randomUUID()}))).status,200);assert.equal(raw.prepare('SELECT quantity FROM stock_items WHERE id=?').get(id).quantity,7);globalThis.testClinicContext.clinicId='c2';assert.equal((await PATCH(request({...move,requestKey:crypto.randomUUID()}))).status,409);});
test('accountants cannot fetch patients or create clinical records',async()=>{const {patient}=setup('accountant');assert.equal((await GET(new Request('https://clinic.test/api/ops?module=patients'))).status,403);assert.equal((await POST(request({module:'visits',data:{patientId:patient,name:'visit'}}))).status,403);});
test('receptionist cannot overwrite clinical history',async()=>{const {raw,patient}=setup('receptionist');raw.prepare('UPDATE patients SET history_enc=? WHERE id=?').run('Sensitive',patient);assert.equal((await PATCH(request({module:'patients',id:patient,data:{name:'Updated',phone:'0592222222'}}))).status,200);assert.equal(raw.prepare('SELECT history_enc FROM patients WHERE id=?').get(patient).history_enc,'Sensitive');assert.equal((await PATCH(request({module:'patients',id:patient,data:{name:'Updated',phone:'0592222222',history:'Overwrite'}}))).status,403);});
test('doctor appointments enforce overlap, allow adjacent slots and protect cancellation',async()=>{const {patient}=setup();const d={name:'Dr A',role:'doctor',speciality:'GP',duration:20,status:'active'};const doctorId=(await (await POST(request({module:'doctors',data:d}))).json()).id;const data={patientId:patient,doctorId,service:'Exam',startsAt:'2026-10-01T08:00:00.000Z',duration:20};const r=await POST(request({module:'appointments',data}));assert.equal(r.status,200);const id=(await r.json()).id;assert.equal((await POST(request({module:'appointments',data:{...data,startsAt:'2026-10-01T08:10:00.000Z'}}))).status,409);assert.equal((await POST(request({module:'appointments',data:{...data,startsAt:'2026-10-01T08:20:00.000Z'}}))).status,200);assert.equal((await PATCH(request({module:'appointments',id,action:'status',status:'cancelled'}))).status,200);assert.equal((await PATCH(request({module:'appointments',id,action:'status',status:'upcoming'}))).status,409);});
test('file signatures reject active content and disguised uploads',()=>{assert.equal(validMedicalFile('image/png',new Uint8Array([137,80,78,71,13,10,26,10])),true);assert.equal(validMedicalFile('application/pdf',new TextEncoder().encode('<script>alert(1)</script>')),false);assert.equal(validMedicalFile('image/svg+xml',new TextEncoder().encode('<svg/>')),false);});
test('working hours and approved leave reject bookings; a doctor rename still protects their slot',async()=>{
 const {patient}=setup();let d={name:'Dr Hours',role:'doctor',duration:20,status:'active',workingDays:'4',start:'08:00',end:'17:00'};
 const id=(await (await POST(request({module:'doctors',data:d}))).json()).id;
 const data={patientId:patient,doctorId:id,service:'Visit',startsAt:'2026-10-01T10:00:00.000Z',duration:20};
 assert.equal((await POST(request({module:'appointments',data:{...data,startsAt:'2026-10-02T10:00:00.000Z'}}))).status,409);
 assert.equal((await POST(request({module:'appointments',data:{...data,startsAt:'2026-10-01T20:00:00.000Z'}}))).status,409);
 assert.equal((await POST(request({module:'appointments',data}))).status,200);
 d={...d,name:'Dr Renamed'};assert.equal((await PATCH(request({module:'doctors',id,version:1,data:d}))).status,200);
 assert.equal((await POST(request({module:'appointments',data}))).status,409);
 assert.equal((await POST(request({module:'attendance',data:{employeeId:id,name:'Vacation',date:'2026-10-01',kind:'leave',status:'approved'}}))).status,201);
 assert.equal((await POST(request({module:'appointments',data:{...data,startsAt:'2026-10-01T12:00:00.000Z'}}))).status,409);
});
test('owner membership cannot be revoked and duplicate staff emails cannot create parallel memberships',async()=>{
 const {raw}=setup();const id=crypto.randomUUID();raw.prepare('INSERT INTO clinic_memberships(id,clinic_id,user_id,email,role) VALUES(?,?,?,?,?)').run(id,'c1','u1','owner@example.com','clinic_admin');
 assert.equal((await PATCH(request({module:'users',id,data:{email:'owner@example.com',role:'nurse',active:false}}))).status,409);
 const body={module:'users',data:{email:'employee@example.com',role:'doctor',active:true}};assert.equal((await POST(request(body))).status,200);assert.equal((await POST(request({...body,data:{...body.data,email:'EMPLOYEE@example.com'}}))).status,409);
});
test('branch inventory, appointments and billing reads stay inside the selected branch; clinic admins can add a branch',async()=>{
 const {raw}=setup();const response=await POST(request({module:'branches',data:{name:'West clinic',address:'Nablus',phone:'0590000000',status:'active'}}));assert.equal(response.status,201);const branchId=(await response.json()).id;
 raw.prepare("INSERT INTO stock_items(id,clinic_id,branch_id,name,batch,category,quantity,threshold) VALUES('stock-west','c1',?,'Gauze','A1','supply',8,2)").run(branchId);
 raw.prepare("INSERT INTO stock_items(id,clinic_id,branch_id,name,batch,category,quantity,threshold) VALUES('stock-main','c1','c1','Tape','A2','supply',4,1)").run();
 assert.equal((await (await GET(new Request('https://clinic.test/api/ops?module=inventory'))).json()).rows.length,1);
 globalThis.testClinicContext.branchId=branchId;globalThis.testClinicContext.branchName='West clinic';assert.deepEqual((await (await GET(new Request('https://clinic.test/api/ops?module=inventory'))).json()).rows.map(r=>r.id),['stock-west']);
 const listed=await (await GET(new Request('https://clinic.test/api/ops?module=branches'))).json();assert.equal(listed.rows.length,2);
});
const {workbook}=await import(url(source('../lib/workbook.ts')));
test('Excel export uses a real OpenXML ZIP with inline strings and escaped values',()=>{const bytes=workbook(['Name','Amount'],[['=HYPERLINK("x")',10.25],['<patient>&',0]],true);assert.equal(new DataView(bytes.buffer).getUint32(0,true),0x04034b50);const text=new TextDecoder().decode(bytes);assert.match(text,/xl\/worksheets\/sheet1.xml/);assert.match(text,/rightToLeft="1"/);assert.match(text,/&lt;patient&gt;&amp;/);assert.doesNotMatch(text,/<f>/);});

const {clinicDate,clinicDayStart,clinicLocalDateTime,clinicTimeToISO}=await import(timeUrl);
test('reports use Palestine day boundaries and persisted receipts',async()=>{
 const {raw,patient}=setup();const id=(await (await POST(request(invoice(patient)))).json()).id;
 const r=await PATCH(request({module:'billing',id,amount:10,method:'cash',requestKey:crypto.randomUUID()}));assert.equal(r.status,200);
 raw.exec("UPDATE invoice_payments SET created_at='2026-10-01 22:30:00'");
 assert.equal(clinicDate('2026-10-01T22:30:00Z'),'2026-10-02');assert.equal(clinicDate(clinicDayStart('2026-10-02')),'2026-10-02');
 const day1=await (await GET(new Request('https://clinic.test/api/ops?module=reports&from=2026-10-01&to=2026-10-01'))).json();assert.equal(day1.revenue,0);
 const day2=await (await GET(new Request('https://clinic.test/api/ops?module=reports&from=2026-10-02&to=2026-10-02'))).json();assert.equal(day2.revenue,1000);assert.equal(day2.daily[0].date,'2026-10-02');assert.equal(day2.debt,1378);
});

test('appointment form consistently translates Palestine wall time on UTC-hosted clients',()=>{const instant=clinicTimeToISO('2026-10-01T10:15');assert.equal(clinicLocalDateTime(instant),'2026-10-01T10:15');assert.equal(clinicDate(instant),'2026-10-01');});

test('new modules persist with branch isolation and financial/clinical role separation',async()=>{
 const {patient}=setup();
 const body={module:'insurance',data:{patientId:patient,name:'Insurer',policyNumber:'P1',date:'2026-10-07',amount:100,coveredAmount:80,status:'pending'}};
 assert.equal((await POST(request(body))).status,201);
 assert.equal((await (await GET(new Request('https://clinic.test/api/ops?module=insurance'))).json()).rows.length,1);
 globalThis.testClinicContext.branchId='other';
 assert.equal((await (await GET(new Request('https://clinic.test/api/ops?module=insurance'))).json()).rows.length,0);
 globalThis.testClinicContext.role='doctor';
 assert.equal((await GET(new Request('https://clinic.test/api/ops?module=insurance'))).status,403);
 globalThis.testClinicContext.role='accountant';
 assert.equal((await GET(new Request('https://clinic.test/api/ops?module=consents'))).status,403);
});
test('package balances and claim coverage reject impossible values',async()=>{
 const {patient}=setup();
 const data={patientId:patient,name:'Treatment',sessions:10,usedSessions:11,amount:500,date:'2026-10-07',expires:'2026-12-07',status:'active'};
 assert.equal((await POST(request({module:'packages',data}))).status,400);
 assert.equal((await POST(request({module:'packages',data:{...data,usedSessions:2}}))).status,201);
 assert.equal((await POST(request({module:'packages',data:{...data,usedSessions:2,expires:'2026-09-01'}}))).status,400);
 assert.equal((await POST(request({module:'insurance',data:{patientId:patient,name:'Insurer',policyNumber:'P1',date:'2026-10-07',amount:100,coveredAmount:120,status:'pending'}}))).status,400);
});
test('signed consent stays immutable and can only be withdrawn with original text',async()=>{
 const {patient}=setup();
 const data={patientId:patient,name:'Procedure',date:'2026-10-07',text:'Agreed risks and alternatives',signer:'Patient',signature:'Patient',status:'signed'};
 const response=await POST(request({module:'consents',data}));assert.equal(response.status,201);const id=(await response.json()).id;
 assert.equal((await PATCH(request({module:'consents',id,version:1,data:{...data,text:'Changed'}}))).status,409);
 assert.equal((await PATCH(request({module:'consents',id,version:1,data:{...data,status:'withdrawn',text:'Changed'}}))).status,409);
 assert.equal((await PATCH(request({module:'consents',id,version:1,data:{...data,status:'withdrawn'}}))).status,200);
 assert.equal((await POST(request({module:'consents',data:{...data,signature:''}}))).status,400);
});
test('waitlist and commissions require a current doctor and valid percentage',async()=>{
 const {patient}=setup();const employeeId=(await (await POST(request({module:'doctors',data:{name:'Nurse',role:'nurse',duration:20,status:'active'}}))).json()).id;
 const wait={patientId:patient,name:'Visit',employeeId,date:'2026-10-07',start:'10:00',end:'12:00',status:'waiting'};
 assert.equal((await POST(request({module:'waitlist',data:wait}))).status,409);
 const doctorId=(await (await POST(request({module:'doctors',data:{name:'Doctor',role:'doctor',duration:20,status:'active'}}))).json()).id;
 assert.equal((await POST(request({module:'waitlist',data:{...wait,employeeId:doctorId}}))).status,201);
 const data={employeeId:doctorId,name:'INV-1',date:'2026-10-07',amount:200,rate:101,status:'pending'};
 assert.equal((await POST(request({module:'commissions',data}))).status,400);
 assert.equal((await POST(request({module:'commissions',data:{...data,rate:30}}))).status,201);
});
