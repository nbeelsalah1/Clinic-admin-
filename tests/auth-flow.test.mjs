import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
const require = createRequire(import.meta.url);
function compiled(path) { return ts.transpileModule(readFileSync(new URL(path, import.meta.url), 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, jsx: ts.JsxEmit.ReactJSX } }).outputText; }
const policy = {};
new Function('exports', compiled('../lib/auth-policy.ts'))(policy);
const component = {};
new Function('require', 'exports', compiled('../app/auth-screen.tsx'))(name => {
  if (name === './auth-client') return { supabase: {}, availableSocialProviders: async () => [], SUPABASE_URL: 'https://example.supabase.co' };
  if (name === '../lib/auth-policy') return policy;
  return require(name);
}, component);

test('social sign-in only offers providers explicitly enabled by the service', () => {
  assert.deepEqual(policy.enabledSocialProviders({ external: { google: false, apple: false, azure: false, email: true } }), []);
  assert.deepEqual(policy.enabledSocialProviders({ external: { google: true, apple: 'true', azure: true } }), ['google', 'azure']);
  assert.deepEqual(policy.enabledSocialProviders(null), []);
});
test('OAuth navigation rejects alternate protocols, origins, credentials and endpoints', () => {
  const base = 'https://example.supabase.co';
  const valid = base + '/auth/v1/authorize?provider=google';
  assert.equal(policy.safeOAuthUrl(valid, base), valid);
  for (const value of ['javascript:alert(1)', 'intent://sign-in', 'http://example.supabase.co/auth/v1/authorize', 'https://evil.example/auth/v1/authorize', 'https://user@example.supabase.co/auth/v1/authorize', base + '/other', null]) {
    assert.throws(() => policy.safeOAuthUrl(value, base));
  }
});
test('failed auth returns are recognized without displaying provider-supplied content', () => {
  const state = policy.authReturnState('https://clinic.example/?plan=starter#error=access_denied&error_description=secret&type=recovery');
  assert.equal(state.hasError, true); assert.equal(state.recovery, false);
  assert.equal(state.cleanPath, '/?plan=starter#type=recovery');
  assert.equal(policy.authReturnState('https://clinic.example/#type=recovery&access_token=example').recovery, true);
  assert.equal(policy.authReturnState('https://clinic.example/#features').cleanPath, '/#features');
});
test('password recovery does not require the user to re-enter an email address', () => {
  const html = renderToStaticMarkup(React.createElement(component.AuthScreen, { lang: 'ar', onLanguageChange() {}, initialMode: 'update' }));
  assert.ok(!html.includes('type="email"'));
  assert.match(html, /autocomplete="new-password"/i);
  assert.ok(html.includes('minLength="8"'));
});
test('existing passwords are not rejected by a registration-only minimum length', () => {
  const html = renderToStaticMarkup(React.createElement(component.AuthScreen, { lang: 'en', onLanguageChange() {}, initialMode: 'signin' }));
  assert.match(html, /autocomplete="current-password"/i);
  assert.ok(!html.includes('minLength="8"'));
  assert.match(html, /disabled=""[^>]*><b class="social-google"/);
});
test('authentication errors distinguish invalid credentials, verification and rate limits', () => {
  assert.equal(policy.authErrorKind({ code: 'invalid_credentials' }), 'credentials');
  assert.equal(policy.authErrorKind({ code: 'email_not_confirmed' }), 'confirm');
  assert.equal(policy.authErrorKind({ code: 'over_email_send_rate_limit' }), 'rate');
  assert.equal(policy.authErrorKind({ message: '<script>secret</script>' }), 'generic');
});
