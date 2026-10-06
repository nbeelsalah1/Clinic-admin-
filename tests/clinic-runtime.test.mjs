import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
import ts from 'typescript';
const require=createRequire(import.meta.url);
const dataUrl=s=>'data:text/javascript;base64,'+Buffer.from(s).toString('base64');
const source=p=>ts.transpileModule(readFileSync(new URL(p,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;
const env={APP_DATA_KEY:Buffer.alloc(32,7).toString('base64'),SUPABASE_URL:'https://auth.example.test',SUPABASE_PUBLISHABLE_KEY:'test-key'};
globalThis.runtimeTestEnv=env;
const envModule=dataUrl('export const env=globalThis.runtimeTestEnv;');
const headersModule=dataUrl('export async function headers(){return new Headers();}');
const policyModule=dataUrl(source('../lib/subscriber-policy.ts'));
const runtimeModule=dataUrl(source('../lib/clinic-runtime.ts').replace('"cloudflare:workers"',JSON.stringify(envModule)).replace('"next/headers"',JSON.stringify(headersModule)).replace('"./subscriber-policy"',JSON.stringify(policyModule)));
const {currentClinicContext,currentProgramContext,getSupabaseUser,encryptPrivate}=await import(runtimeModule);
const modelModule=dataUrl(source('../lib/ops-model.ts').replace("'zod'",JSON.stringify(pathToFileURL(require.resolve('zod')).href)));
const routeModule=dataUrl(source('../app/api/clinic-data/route.ts').replace('"../../../lib/clinic-runtime"',JSON.stringify(runtimeModule)).replace('"../../../lib/ops-model"',JSON.stringify(modelModule)));
const {GET}=await import(routeModule);
function setup(t,role='clinic_admin'){
 const raw=new DatabaseSync(':memory:');
 for(const f of readdirSync(new URL('../drizzle/',import.meta.url)).filter(f=>f.endsWith('.sql')).sort())raw.exec(readFileSync(new URL('../drizzle/'+f,import.meta.url),'utf8'));
 env.DB={prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return raw.prepare(sql).get(...values)??null;},async all(){return {results:raw.prepare(sql).all(...values)};},async run(){return {meta:{changes:Number(raw.prepare(sql).run(...values).changes)}};}};}};
 const clinicId=crypto.randomUUID(),userId=crypto.randomUUID();
 raw.prepare("INSERT INTO clinics(id,name,owner_user_id,trial_ends_at) VALUES(?,?,?,?)").run(clinicId,'Test clinic',userId,'2099-01-01T00:00:00Z');
 raw.prepare('INSERT INTO clinic_memberships(id,clinic_id,user_id,email,role,active) VALUES(?,?,?,?,?,1)').run(crypto.randomUUID(),clinicId,userId,'user@example.test',role);
 t.mock.method(globalThis,'fetch',async()=>Response.json({id:userId,email:'user@example.test',email_confirmed_at:'2026-01-01T00:00:00Z'}));
 t.after(()=>raw.close());
 return {raw,clinicId,userId};
}
const request=branchId=>new Request('https://clinic.test/api/clinic-data',{headers:{Authorization:'Bearer test-session',...(branchId?{'X-Clinic-Branch-ID':branchId}:{})}});
test('real clinic initialization returns clinic identity and role used by navigation',async t=>{
 const {raw,clinicId}=setup(t);
 const c=await currentClinicContext(request());assert.equal(c.clinicId,clinicId);assert.equal(c.role,'clinic_admin');assert.equal(c.branchId,clinicId);
 const patientId=crypto.randomUUID();raw.prepare('INSERT INTO patients(id,clinic_id,full_name_enc,phone_enc) VALUES(?,?,?,?)').run(patientId,clinicId,await encryptPrivate('Test patient'),await encryptPrivate('0590000000'));
 const response=await GET(request());assert.equal(response.status,200);const result=await response.json();assert.equal(result.user.role,'clinic_admin');assert.equal(result.clinic.name,'Test clinic');assert.equal(result.patients[0].name,'Test patient');
});
test('staff default branch initialization is repeatable and preserves revocation',async t=>{
 const {raw,clinicId,userId}=setup(t,'nurse');
 assert.equal((await currentClinicContext(request())).branchId,clinicId);
 assert.equal((await currentClinicContext(request())).branchId,clinicId);
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM clinic_branch_memberships').get().n,1);
 raw.prepare('UPDATE clinic_branch_memberships SET active=0 WHERE user_id=?').run(userId);
 assert.equal((await currentClinicContext(request())).status,403);
});
test('a branch header cannot grant staff access to an unassigned branch',async t=>{
 const {raw,clinicId}=setup(t,'nurse');await currentClinicContext(request());const other=crypto.randomUUID();
 raw.prepare('INSERT INTO clinic_branches(id,clinic_id,name) VALUES(?,?,?)').run(other,clinicId,'Second branch');
 assert.equal((await currentClinicContext(request(other))).status,403);
});

const overviewModule=dataUrl(source('../app/api/admin/overview/route.ts').replace("'../../../../lib/clinic-runtime'",JSON.stringify(runtimeModule)));
const {GET:programOverview}=await import(overviewModule);
test('program administrator needs no clinic, branch membership or clinic license',async t=>{
 const {raw,clinicId,userId}=setup(t);
 raw.prepare('DELETE FROM clinic_memberships WHERE clinic_id=?').run(clinicId);
 raw.prepare('DELETE FROM clinics WHERE id=?').run(clinicId);
 raw.prepare("INSERT INTO platform_users(user_id,email,role) VALUES(?,?,'super_admin')").run(userId,'user@example.test');
 const context=await currentProgramContext(request(crypto.randomUUID()));assert.equal(context.isSuperAdmin,true);
 const response=await GET(request());assert.equal(response.status,200);const account=await response.json();assert.equal(account.user.role,'super_admin');assert.equal(account.scope,'program');assert.equal(account.clinic,undefined);
 const overview=await programOverview(request());assert.equal(overview.status,200);assert.deepEqual((await overview.json()).clinics,[]);
 assert.equal(raw.prepare('SELECT COUNT(*) AS n FROM clinics').get().n,0);
});
test('clinic administrator cannot access program administration',async t=>{
 setup(t);assert.equal((await currentProgramContext(request())).status,403);assert.equal((await programOverview(request())).status,403);
 const account=await (await GET(request())).json();assert.equal(account.user.role,'clinic_admin');assert.equal(account.user.isSuperAdmin,false);
});

test('verified TOTP enrollment requires provider-validated AAL2 claims matching the user',async t=>{
 const {userId}=setup(t);t.mock.method(globalThis,'fetch',async()=>Response.json({id:userId,email:'user@example.test',email_confirmed_at:'2026-01-01T00:00:00Z',factors:[{factor_type:'totp',status:'verified'}]}));
 const make=(aal,sub=userId)=>new Request('https://clinic.test/api/test',{headers:{Authorization:'Bearer header.'+Buffer.from(JSON.stringify({aal,sub})).toString('base64url')+'.signature'}});
 assert.equal(await getSupabaseUser(make('aal1')),null);assert.equal((await getSupabaseUser(make('aal2'))).userId,userId);assert.equal(await getSupabaseUser(make('aal2','another-user')),null);
});
