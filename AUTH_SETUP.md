# Authentication setup

The live app uses Supabase project `ergbpkenqvdyjutjmnpd` for identity. Clinic permissions remain enforced by the server; social sign-in never grants a clinic membership or administrator role.

## Current provider status

Verified through the public `/auth/v1/settings` endpoint on 2026-10-06 UTC:

- Email/password: enabled; email confirmation required.
- Google, Apple, Microsoft (Azure): disabled.

The login screen now checks the provider status, disables unavailable providers, and keeps email login available. Provider credentials must be configured before those buttons can become available. Do not put client secrets in GitHub or browser code.

## Enable social sign-in

In this Supabase project's Authentication provider settings, configure each provider using its own OAuth application and securely store the provider's credentials there.

- Supabase provider callback: `https://ergbpkenqvdyjutjmnpd.supabase.co/auth/v1/callback`
- Site URL: `https://clinic-ops-palestine.nbeelsalah4.chatgpt.site/`
- Allow the same exact site URL in Authentication URL Configuration / Redirect URLs. Add other deployed origins individually only when needed.
- Microsoft requires the `email` scope; the app already requests it.

Enable each provider after configuring its OAuth app. Reload the sign-in screen; the app reads current availability. Verify a real account can finish the round trip and returns to its existing clinic with the correct role. Provider availability alone does not verify credentials or redirect allowlists.

## Validation

`node --test tests/*.test.mjs` covers recovery form requirements, existing-password sign-in, provider availability, callback error handling and OAuth redirect validation, as well as the existing clinic isolation and role checks. TypeScript and production build checks are also required.

No real user's password was changed and no registration or reset email was sent during automated verification. Email delivery, real credentials, provider redirects and a completed authenticated session still require an authorized account to verify end to end.
