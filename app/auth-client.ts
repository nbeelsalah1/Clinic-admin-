import { createClient } from "@supabase/supabase-js";

// A Supabase publishable key is intentionally public; server access is still checked
// against the user's verified access token in every API route.
export const supabase = createClient(
  "https://ergbpkenqvdyjutjmnpd.supabase.co",
  "sb_publishable_LjZ-VJmuS7XIojzP3ZNLsQ_-_gUlZtn",
  { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } },
);

export async function authFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (session?.access_token) headers.set("Authorization", `Bearer ${session.access_token}`);
  if(typeof window!=='undefined'){const branchId=localStorage.getItem('clinic-active-branch');if(branchId)headers.set('X-Clinic-Branch-ID',branchId);}
  return fetch(input, { ...init, headers });
}
