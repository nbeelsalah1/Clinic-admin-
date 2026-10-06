import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
const source = readFileSync(new URL("../lib/didit-policy.ts", import.meta.url), "utf8");
const code = ts.transpileModule(source, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ES2022 } }).outputText;
const { isVerified, decisionStatuses, safeSessionUrl, canResume } = await import(`data:text/javascript;base64,${Buffer.from(code).toString("base64")}`);
test("sandbox approvals and partial checks never verify a real account", () => {
  assert.equal(isVerified("sandbox", "Approved", "Approved", "Approved"), false);
  assert.equal(isVerified("live", "Approved", "Approved", "Not Started"), false);
  assert.equal(isVerified("live", "In Review", "Approved", "Approved"), false);
  assert.equal(isVerified("live", "Approved", "Approved", "Approved"), true);
});
test("an aggregate approval or status override does not imply completed document or SMS checks", () => {
  assert.deepEqual(decisionStatuses({ status: "Approved" }), { status: "Approved", documentStatus: "Not Started", phoneStatus: "Not Started" });
  const result = decisionStatuses({ status: "Approved", decision: { id_verifications: [{ status: "Approved" }], phone_verifications: [{ status: "Declined" }] } });
  assert.equal(isVerified("live", result.status, result.documentStatus, result.phoneStatus), false);
  assert.equal(decisionStatuses({ status: "forged" }).status, "Not Started");
});
test("hosted links cannot redirect to an attacker or insecure endpoint", () => {
  for (const url of ["javascript:alert(1)", "http://verify.didit.me/session/a", "https://verify.didit.me.evil.example/a", "https://evil.example/a", "https://user:pass@verify.didit.me/a", "https://verify.didit.me:8443/a"]) assert.equal(safeSessionUrl(url), null);
  assert.equal(safeSessionUrl("https://verify.didit.me/ar/session/example"), "https://verify.didit.me/ar/session/example");
});
test("finished, expired, or old sessions cannot be resumed", () => {
  const now = new Date().toISOString();
  assert.equal(canResume("In Progress", now), true);
  assert.equal(canResume("Approved", now), false);
  assert.equal(canResume("Expired", now), false);
  assert.equal(canResume("In Progress", "2020-01-01 00:00:00"), false);
});
