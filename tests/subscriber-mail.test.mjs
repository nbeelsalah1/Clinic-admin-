import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,readdirSync} from "node:fs";
import {DatabaseSync} from "node:sqlite";
import ts from "typescript";
function moduleSource(path){return ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;}
const url=source=>`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`;
const policy=url(moduleSource("../lib/subscriber-policy.ts"));
const templates=url(moduleSource("../lib/subscriber-templates.ts").replace('"./subscriber-policy"',JSON.stringify(policy)));
// Stub encryption only; the production send/lock/retry implementation is executed unchanged.
const cryptoStub=url('export async function encryptPrivate(v){return v;} export async function decryptPrivate(v){return v||"";}');
const moduleUrl=url(moduleSource("../lib/subscriber-mail.ts").replace('"./clinic-runtime"',JSON.stringify(cryptoStub)).replace('"./subscriber-templates"',JSON.stringify(templates)));
const {queueSubscriberMail,sendOutboxMail}=await import(moduleUrl);
function database(){const raw=new DatabaseSync(":memory:");const dir=new URL("../drizzle/",import.meta.url);for(const f of readdirSync(dir).filter(f=>f.endsWith(".sql")).sort())raw.exec(readFileSync(new URL(f,dir),"utf8"));
  const db={prepare(sql){let values=[];return {bind(...v){values=v;return this;},async first(){return raw.prepare(sql).get(...values)??null;},async run(){return {meta:raw.prepare(sql).run(...values)};}};}};
  return {db,raw};
}
test("an unconfigured sender keeps messages queued without attempting a network send",async()=>{
  const {db,raw}=database();const mail=await queueSubscriberMail(db,"event-a","trial_requested","subscriber@example.com",{clinicName:"Clinic",language:"en"});await mail.statement.run();
  assert.equal(await sendOutboxMail(db,mail.id),"not_configured");assert.equal(raw.prepare('SELECT attempts FROM email_outbox').get().attempts,0);
});
test("retry freezes the payload, reuses the idempotency key, and clears license content on acceptance",async()=>{
  const {db,raw}=database();raw.exec("INSERT INTO email_settings VALUES ('resend','fake-test-credential','sender@example.com','support@example.com',1,CURRENT_TIMESTAMP)");
  const mail=await queueSubscriberMail(db,"payment-event","payment_confirmed","subscriber@example.com",{clinicName:"Clinic",language:"en",licenseKey:"TEST-LICENSE"});await mail.statement.run();
  const requests=[],original=globalThis.fetch;
  globalThis.fetch=async(_url,options)=>{requests.push(options);return requests.length===1?new Response('{}',{status:503}):Response.json({id:"provider-reference"});};
  try{
    assert.equal(await sendOutboxMail(db,mail.id),"retry");raw.exec("UPDATE email_outbox SET next_attempt_at=0; UPDATE email_settings SET from_email='new@example.com'");
    assert.equal(await sendOutboxMail(db,mail.id),"accepted");assert.equal(requests[0].body,requests[1].body);assert.equal(requests[0].headers['Idempotency-Key'],requests[1].headers['Idempotency-Key']);
    assert.equal(await sendOutboxMail(db,mail.id),"skipped");assert.equal(requests.length,2);
    const record=raw.prepare("SELECT status,payload_enc,request_enc FROM email_outbox").get();assert.equal(record.status,"accepted");assert.equal(record.payload_enc,null);assert.equal(record.request_enc,null);
  }finally{globalThis.fetch=original;}
});
test("an uncertain retry outside the safe idempotency window is blocked without sending",async()=>{
  const {db,raw}=database();raw.exec("INSERT INTO email_settings VALUES ('resend','fake-test-credential','sender@example.com','support@example.com',1,CURRENT_TIMESTAMP)");
  const mail=await queueSubscriberMail(db,"event-old","trial_requested","subscriber@example.com",{clinicName:"Clinic",language:"ar"});await mail.statement.run();
  raw.prepare("UPDATE email_outbox SET first_attempt_at=?").run(Math.floor(Date.now()/1000)-24*3600);
  const original=globalThis.fetch;globalThis.fetch=()=>{throw new Error("must not send");};
  try{assert.equal(await sendOutboxMail(db,mail.id),"blocked");assert.equal(raw.prepare("SELECT error_code FROM email_outbox").get().error_code,"idempotency_window_expired");}finally{globalThis.fetch=original;}
});
