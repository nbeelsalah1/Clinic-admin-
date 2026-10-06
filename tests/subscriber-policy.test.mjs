import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import ts from "typescript";
function moduleSource(path){return ts.transpileModule(readFileSync(new URL(path,import.meta.url),"utf8"),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ES2022}}).outputText;}
const policyUrl=`data:text/javascript;base64,${Buffer.from(moduleSource("../lib/subscriber-policy.ts")).toString("base64")}`;
const {trialExpiry,trialIsActive}=await import(policyUrl);
const {subscriberEmail}=await import(`data:text/javascript;base64,${Buffer.from(moduleSource("../lib/subscriber-templates.ts").replace('"./subscriber-policy"',JSON.stringify(policyUrl))).toString("base64")}`);
test("trial starts at approval, lasts exactly 30 days, and expires at its boundary",()=>{
  const start=new Date("2028-01-31T10:00:00.000Z"),end=trialExpiry(start);
  assert.equal(Date.parse(end)-start.getTime(),30*86400000);
  assert.equal(trialIsActive(end,new Date(Date.parse(end)-1)),true);
  assert.equal(trialIsActive(end,new Date(end)),false);
  assert.equal(trialIsActive(null,start),false);
  assert.equal(trialIsActive("invalid",start),false);
});
test("untrusted clinic names cannot inject HTML into subscriber email",()=>{
  for(const language of ["ar","he","en"]){const mail=subscriberEmail("trial_approved",{clinicName:'<script>alert("x")</script>',language,expiresAt:"2027-01-01T12:00:00Z"});assert.ok(!mail.html.includes("<script>"));assert.ok(mail.html.includes("&lt;script&gt;"));assert.ok(mail.html.includes(`lang="${language}"`));assert.ok(mail.html.includes(`dir="${language==="en"?"ltr":"rtl"}"`));assert.ok(mail.text.includes('<script>'));}
});
test("pending payment email does not expose a license; confirmed payment email includes the issued code",()=>{
  const pending=subscriberEmail("subscription_created",{clinicName:"Clinic",language:"en",amountIls:99});
  assert.ok(pending.text.includes("awaiting payment confirmation"));assert.ok(!pending.text.includes("AYD-"));
  const paid=subscriberEmail("payment_confirmed",{clinicName:"Clinic",language:"ar",licenseKey:"AYD-TEST"});assert.ok(paid.text.includes("AYD-TEST"));
});
