"use client";

import { useEffect, useState } from "react";
import type { FormEvent } from "react";
import { HeartPulse, Languages, LoaderCircle, LockKeyhole } from "lucide-react";
import { availableSocialProviders, SUPABASE_URL, supabase } from "./auth-client";
import { authErrorKind, safeOAuthUrl, type SocialProvider } from "../lib/auth-policy";

type Language = "ar" | "he" | "en";
const copy = {
  ar: { title: "إدارة عيادتك، بأمان", intro: "سجّل الدخول أو أنشئ حساباً لمتابعة عيادتك.", email: "البريد الإلكتروني", password: "كلمة المرور", newPassword: "كلمة المرور الجديدة", update: "حفظ كلمة المرور الجديدة", signIn: "تسجيل الدخول", signUp: "إنشاء حساب", forgot: "نسيت كلمة المرور؟", reset: "إرسال رابط الاستعادة", switchIn: "لديك حساب؟ تسجيل الدخول", switchUp: "مستخدم جديد؟ إنشاء حساب", checkMail: "أرسلنا رسالة تأكيد إلى بريدك. افتح الرابط ثم سجّل الدخول.", resetSent: "إذا كان البريد مسجلاً، ستصلك رسالة لاستعادة كلمة المرور.", error: "تعذر إكمال العملية. تحقق من البيانات وتأكيد البريد.", socialError: "تعذر بدء الدخول الاجتماعي. تحقق من تفعيل الموفّر وإعدادات إعادة التوجيه في Supabase.", google: "المتابعة باستخدام Google", apple: "المتابعة باستخدام Apple", microsoft: "المتابعة باستخدام Microsoft", or: "أو بالبريد الإلكتروني", back: "العودة لتسجيل الدخول", working: "جارٍ المعالجة…" },
  he: { title: "ניהול המרפאה, בצורה מאובטחת", intro: "התחברו או צרו חשבון כדי להמשיך למרפאה.", email: "כתובת דוא״ל", password: "סיסמה", newPassword: "סיסמה חדשה", update: "שמירת הסיסמה החדשה", signIn: "התחברות", signUp: "יצירת חשבון", forgot: "שכחתם סיסמה?", reset: "שליחת קישור לאיפוס", switchIn: "יש לכם חשבון? התחברות", switchUp: "משתמשים חדשים? יצירת חשבון", checkMail: "שלחנו הודעת אימות לכתובת שלכם. פתחו את הקישור ואז התחברו.", resetSent: "אם הכתובת רשומה, תישלח הודעה לאיפוס הסיסמה.", error: "הפעולה נכשלה. בדקו את הפרטים ואת אימות כתובת הדוא״ל.", socialError: "לא ניתן להתחיל התחברות חברתית. בדקו שספק הכניסה וכתובות ההפניה מופעלים ב-Supabase.", google: "המשך באמצעות Google", apple: "המשך באמצעות Apple", microsoft: "המשך באמצעות Microsoft", or: "או באמצעות דוא״ל", back: "חזרה להתחברות", working: "מעבד…" },
  en: { title: "Your clinic, securely managed", intro: "Sign in or create an account to continue to your clinic.", email: "Email address", password: "Password", newPassword: "New password", update: "Save new password", signIn: "Sign in", signUp: "Create account", forgot: "Forgot password?", reset: "Send reset link", switchIn: "Already registered? Sign in", switchUp: "New here? Create an account", checkMail: "We sent a confirmation email. Open its link, then sign in.", resetSent: "If that email is registered, a password reset link is on its way.", error: "The request failed. Check your details and email confirmation.", socialError: "Social sign-in could not start. Check that the provider and redirect URLs are enabled in Supabase.", google: "Continue with Google", apple: "Continue with Apple", microsoft: "Continue with Microsoft", or: "or continue with email", back: "Back to sign in", working: "Working…" },
} satisfies Record<Language, Record<string, string>>;

export function AuthScreen({ lang, onLanguageChange, initialMode = "signin", initialError = false, onPasswordUpdated }: { lang: Language; onLanguageChange: (language: Language) => void; initialMode?: "signin" | "signup" | "update"; initialError?: boolean; onPasswordUpdated?: () => void | Promise<void> }) {
  const [mode, setMode] = useState<"signin" | "signup" | "reset" | "update">(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const t = copy[lang];
  const [providers, setProviders] = useState<SocialProvider[]>([]);
  const [providerStatus, setProviderStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [retryProviders, setRetryProviders] = useState(0);
  const extra = {
    ar: { unavailable: "الدخول الاجتماعي غير مفعّل حاليًا. يمكنك الدخول بالبريد الإلكتروني.", loading: "جارٍ التحقق من طرق الدخول…", providerCheck: "تعذر التحقق من طرق الدخول الاجتماعي. يمكنك استخدام البريد الإلكتروني.", retry: "إعادة التحقق", credentials: "البريد الإلكتروني أو كلمة المرور غير صحيحة.", confirm: "أكد بريدك الإلكتروني من رسالة التسجيل أولًا.", rate: "محاولات كثيرة. انتظر قليلًا ثم أعد المحاولة.", weak: "اختر كلمة مرور قوية وجديدة من 8 أحرف على الأقل.", expired: "انتهت صلاحية رابط الدخول أو الاستعادة. اطلب رابطًا جديدًا.", generic: "تعذر إكمال العملية. تحقق من اتصالك وحاول مجددًا.", returned: "لم يكتمل تسجيل الدخول أو انتهت صلاحية الرابط. أعد المحاولة أو اطلب رابط استعادة جديدًا." },
    he: { unavailable: "כניסה חברתית אינה פעילה כרגע. אפשר להתחבר בדוא״ל.", loading: "בודק אפשרויות כניסה…", providerCheck: "לא ניתן לבדוק כניסה חברתית. אפשר להשתמש בדוא״ל.", retry: "בדיקה מחדש", credentials: "כתובת הדוא״ל או הסיסמה שגויה.", confirm: "אמתו תחילה את כתובת הדוא״ל בהודעת ההרשמה.", rate: "יותר מדי ניסיונות. המתינו ונסו שוב.", weak: "בחרו סיסמה חזקה וחדשה בת 8 תווים לפחות.", expired: "תוקף הקישור פג. בקשו קישור חדש.", generic: "הפעולה נכשלה. בדקו את החיבור ונסו שוב.", returned: "הכניסה לא הושלמה או שתוקף הקישור פג. נסו שוב או בקשו קישור חדש." },
    en: { unavailable: "Social sign-in is not enabled yet. You can sign in with email.", loading: "Checking sign-in options…", providerCheck: "Could not check social sign-in options. You can use email.", retry: "Check again", credentials: "Incorrect email address or password.", confirm: "Confirm your email using the registration message first.", rate: "Too many attempts. Wait a moment and try again.", weak: "Choose a strong, new password with at least 8 characters.", expired: "This sign-in or recovery link has expired. Request a new link.", generic: "The request failed. Check your connection and try again.", returned: "Sign-in did not complete or the link expired. Try again or request a new recovery link." },
  }[lang];
  useEffect(() => {
    let active = true;
    setProviderStatus('loading');
    void availableSocialProviders().then(value => { if (active) { setProviders(value); setProviderStatus('ready'); } })
      .catch(() => { if (active) { setProviders([]); setProviderStatus('error'); } });
    return () => { active = false; };
  }, [retryProviders]);
  useEffect(() => { setMode(initialMode); }, [initialMode]);
  useEffect(() => { if (initialError) setError(extra.returned); }, [initialError, extra.returned]);

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); if (busy) return; setBusy(true); setMessage(""); setError("");
    try {
      if (mode === "signup") {
        const { error: signUpError } = await supabase.auth.signUp({ email: email.trim(), password, options: { emailRedirectTo: `${window.location.origin}/` } });
        if (signUpError) throw signUpError;
        setMessage(t.checkMail); setMode("signin");
      } else if (mode === "reset") {
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${window.location.origin}/` });
        if (resetError) throw resetError;
        setMessage(t.resetSent);
      } else if (mode === "update") {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        await onPasswordUpdated?.();
        setPassword(""); setMode("signin");
      } else {
        const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (signInError) throw signInError;
      }
    } catch (cause) { setError(extra[authErrorKind(cause)]); }
    finally { setBusy(false); }
  };

  const signInWithProvider = async (provider: SocialProvider) => {
    if (busy || !providers.includes(provider)) return;
    setBusy(true); setMessage(""); setError("");
    try {
      // Recheck on click so a provider disabled after rendering cannot redirect.
      if (!(await availableSocialProviders()).includes(provider)) {
        setProviders(current => current.filter(value => value !== provider));
        setError(extra.unavailable); return;
      }
      const { data, error: providerError } = await supabase.auth.signInWithOAuth({ provider, options: { skipBrowserRedirect: true, redirectTo: `${window.location.origin}/`, ...(provider === "azure" ? { scopes: "email" } : {}) } });
      if (providerError) throw providerError;
      window.location.assign(safeOAuthUrl(data.url, SUPABASE_URL));
    } catch { setError(extra.generic); }
    finally { setBusy(false); }
  };

  return <main className="auth-shell" dir={lang === "en" ? "ltr" : "rtl"}>
    <section className="auth-card">
      <header className="auth-brand"><span><HeartPulse size={25}/></span><div><b>عيادتي</b><small>CLINIC MANAGEMENT</small></div><button className="auth-language" onClick={() => onLanguageChange(lang === "ar" ? "he" : lang === "he" ? "en" : "ar")}><Languages size={17}/>{lang.toUpperCase()}</button></header>
      <div className="auth-heading"><span><LockKeyhole size={20}/></span><h1>{t.title}</h1><p>{t.intro}</p></div>
      {(mode === "signin" || mode === "signup") && <div className="auth-social" aria-label="Social sign in">
        <button type="button" disabled={busy || !providers.includes("google")} onClick={() => void signInWithProvider("google")}><b className="social-google">G</b>{t.google}</button>
        <button type="button" disabled={busy || !providers.includes("apple")} onClick={() => void signInWithProvider("apple")}><b className="social-apple">●</b>{t.apple}</button>
        <button type="button" disabled={busy || !providers.includes("azure")} onClick={() => void signInWithProvider("azure")}><b className="social-microsoft">▦</b>{t.microsoft}</button>
        <p role="status">{providerStatus === 'loading' ? extra.loading : providerStatus === 'error' ? extra.providerCheck : providers.length === 0 ? extra.unavailable : null}</p>
        {providerStatus === 'error' && <button type="button" disabled={busy} onClick={() => setRetryProviders(value => value + 1)}>{extra.retry}</button>}
        <span>{t.or}</span>
      </div>}
      <form onSubmit={submit} className="auth-form">
        {mode !== "update" && <label>{t.email}<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)} dir="ltr" disabled={busy}/></label>}
        {mode !== "reset" && <label>{mode === "update" ? t.newPassword : t.password}<input type="password" autoComplete={mode === "signup" || mode === "update" ? "new-password" : "current-password"} minLength={mode === "signin" ? undefined : 8} disabled={busy} required value={password} onChange={e => setPassword(e.target.value)} dir="ltr"/></label>}
        {message && <p className="auth-message" role="status">{message}</p>}{error && <p className="auth-error" role="alert">{error}</p>}
        <button className="auth-submit" disabled={busy}>{busy && <LoaderCircle size={17} className="auth-spinner"/>}{busy ? t.working : mode === "reset" ? t.reset : mode === "update" ? t.update : mode === "signup" ? t.signUp : t.signIn}</button>
      </form>
      {mode === "signin" && <button disabled={busy} className="auth-text-button" onClick={() => { setMode("reset"); setMessage(""); setError(""); }}>{t.forgot}</button>}
      {(mode === "signin" || mode === "signup") && <div className="auth-trial"><button disabled={busy} onClick={()=>{setMode("signup");setMessage("");setError("");}}>{lang==="ar"?"اطلب تجربة مجانية لمدة شهر":lang==="he"?"בקשו חודש ניסיון חינם":"Request one month free"}</button><p>{lang==="ar"?"أنشئ حسابًا وأكد بريدك، ثم أرسل طلب التجربة. 30 يومًا من موافقة الإدارة، دون بطاقة دفع أو تجديد مدفوع تلقائي.":lang==="he"?"צרו חשבון, אמתו דוא״ל ובקשו ניסיון של 30 יום מאישור ההנהלה, ללא כרטיס או חיוב אוטומטי.":"Create an account, confirm your email, then request 30 days from administration approval. No payment card or automatic paid renewal."}</p></div>}
      {mode !== "update" && <footer className="auth-footer">{mode === "reset" ? <button disabled={busy} onClick={() => setMode("signin")}>{t.back}</button> : <button disabled={busy} onClick={() => { setMode(mode === "signin" ? "signup" : "signin"); setMessage(""); setError(""); }}>{mode === "signin" ? t.switchUp : t.switchIn}</button>}</footer>}
    </section>
  </main>;
}
