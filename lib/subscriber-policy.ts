export type MailLanguage = "ar" | "he" | "en";
export function mailLanguage(value: unknown): MailLanguage { return value === "he" || value === "en" ? value : "ar"; }
export function trialExpiry(now: Date): string { return new Date(now.getTime() + 30 * 86400000).toISOString(); }
export function trialIsActive(endsAt: string | null | undefined, now = new Date()): boolean { return Boolean(endsAt && Number.isFinite(Date.parse(endsAt)) && Date.parse(endsAt) > now.getTime()); }
export function escapeHtml(value: string): string { return value.replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]!)); }
export function validEmail(value: unknown): value is string { return typeof value === "string" && value.length <= 254 && /^[^\s<>@]+@[^\s<>@]+\.[^\s<>@]+$/.test(value); }
