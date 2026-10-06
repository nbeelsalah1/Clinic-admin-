export type SocialProvider = 'google' | 'apple' | 'azure';
export const socialProviders: SocialProvider[] = ['google', 'apple', 'azure'];

export function enabledSocialProviders(settings: unknown): SocialProvider[] {
  if (!settings || typeof settings !== 'object') return [];
  const external = (settings as { external?: Record<string, unknown> }).external;
  return socialProviders.filter(provider => external?.[provider] === true);
}

// Only navigate to this project's HTTPS authorization endpoint. The provider's
// redirects are handled by Supabase; client data never selects another origin.
export function safeOAuthUrl(value: string | null, supabaseUrl: string): string {
  if (!value) throw new Error('invalid_oauth_url');
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.origin !== new URL(supabaseUrl).origin ||
      url.pathname !== '/auth/v1/authorize' || url.username || url.password) {
    throw new Error('invalid_oauth_url');
  }
  return url.href;
}

export function authReturnState(href: string) {
  const url = new URL(href);
  const hash = new URLSearchParams(url.hash.slice(1));
  const keys = ['error', 'error_code', 'error_description'];
  const hasError = keys.some(key => hash.has(key) || url.searchParams.has(key));
  const recovery = !hasError && hash.get('type') === 'recovery';
  for (const key of keys) { hash.delete(key); url.searchParams.delete(key); }
  // Preserve ordinary anchors and unrelated query parameters.
  if (hasError) url.hash = hash.toString();
  return { hasError, recovery, cleanPath: url.pathname + url.search + url.hash };
}

export function authErrorKind(error: unknown): 'credentials' | 'confirm' | 'rate' | 'weak' | 'expired' | 'generic' {
  const code = typeof error === 'object' && error !== null && 'code' in error ? error.code : '';
  if (code === 'invalid_credentials') return 'credentials';
  if (code === 'email_not_confirmed') return 'confirm';
  if (code === 'over_request_rate_limit' || code === 'over_email_send_rate_limit') return 'rate';
  if (code === 'weak_password' || code === 'same_password') return 'weak';
  if (code === 'otp_expired' || code === 'session_not_found') return 'expired';
  return 'generic';
}
