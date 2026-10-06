import { createClient } from "@supabase/supabase-js";
import { authReturnState, enabledSocialProviders } from "../lib/auth-policy";

export const SUPABASE_URL = "https://ergbpkenqvdyjutjmnpd.supabase.co";
const PUBLISHABLE_KEY = "sb_publishable_LjZ-VJmuS7XIojzP3ZNLsQ_-_gUlZtn";
// Capture the return state before the SDK consumes and cleans the token hash.
export const authReturn = typeof window === "undefined" ? null : authReturnState(window.location.href);

// A Supabase publishable key is intentionally public; server access is still checked
// against the user's verified access token in every API route.
export const supabase = createClient(
  SUPABASE_URL,
  PUBLISHABLE_KEY,
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  if(typeof window!=='undefined'){const branchId=localStorage.getItem('clinic-active-branch');if(branchId)headers.set('X-Clinic-Branch-ID',branchId);}
  return fetch(input, { ...init, headers });
}

export async function availableSocialProviders() {
  const response = await fetch(`${SUPABASE_URL}/auth/v1/settings`, {
    headers: { apikey: PUBLISHABLE_KEY },
    signal: AbortSignal.timeout(8000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error("auth_settings_unavailable");
  return enabledSocialProviders(await response.json());
}
