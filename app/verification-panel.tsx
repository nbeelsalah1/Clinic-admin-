"use client";
import { useCallback, useEffect, useState } from "react";
import { ExternalLink, RefreshCw, ShieldCheck, Smartphone, FileCheck2 } from "lucide-react";
import { authFetch } from "./auth-client";
import { SANDBOX_WORKFLOW_ID } from "@/lib/didit-policy";

const copy = {
  ar: { title:"التحقق من الهوية والهاتف", note:"تحقق من وثيقة الهوية ثم أكد رقم هاتفك برمز SMS عبر Didit. تبقى صور الوثائق لدى Didit؛ نحفظ مرجع الجلسة وحالات الفحص فقط.", start:"بدء التحقق", resume:"متابعة التحقق على Didit", refresh:"تحديث النتيجة", doc:"وثيقة الهوية", phone:"الهاتف عبر SMS", verified:"تم التحقق", pending:"لم يكتمل التحقق", missing:"خدمة التحقق لم تُفعّل بعد. تواصل مع إدارة البرنامج.", sandbox:"وضع اختبار: النتائج محاكاة ولا تُعتبر تحققًا حقيقيًا، ولا تُرسل رسائل SMS فعلية.", config:"إعداد Didit — إدارة البرنامج", key:"API Key", workflow:"Workflow ID المنشور", mode:"بيئة التشغيل", live:"تشغيل حقيقي", test:"اختبار Sandbox", save:"حفظ إعداد الربط", saved:"تم حفظ الإعداد المشفر. ابدأ جلسة للتحقق من الاتصال.", setup:"للتشغيل الحقيقي: اشحن رصيد مؤسسة Didit، ثم انشر مسارًا يحتوي OCR وPHONE_VERIFICATION مع SMS لفلسطين وإسرائيل. استخدم مفتاح التطبيق الموافق للبيئة.", error:"تعذر الاتصال بخدمة التحقق. أعد المحاولة أو راجع الإعدادات.", limited:"وصلت إلى حد المحاولات. انتظر قبل المحاولة مجددًا.", auth:"انتهت الجلسة. سجّل الدخول مجددًا.", provider:"راجع مفتاح Didit وصلاحياته.", balance:"يحتاج حساب Didit إلى رصيد لتفعيل SMS.", invalid:"أدخل المفتاح ومعرّف مسار منشور صحيحين ومتوافقين مع البيئة.", updated:"آخر تحديث", loading:"جارٍ التحميل…" },
  he: { title:"אימות זהות וטלפון", note:"אמתו תעודת זהות ואז את מספר הטלפון בקוד SMS דרך Didit. התמונות נשארות ב-Didit; נשמרים רק מזהה הפעלה וסטטוסים.", start:"התחלת אימות", resume:"המשך האימות ב-Didit", refresh:"רענון התוצאה", doc:"תעודת זהות", phone:"טלפון ב-SMS", verified:"מאומת", pending:"האימות לא הושלם", missing:"שירות האימות טרם הוגדר. פנו להנהלת המערכת.", sandbox:"סביבת בדיקה: תוצאות מדומות, ללא אימות אמיתי או הודעות SMS אמיתיות.", config:"הגדרת Didit — הנהלת המערכת", key:"API Key", workflow:"Workflow ID שפורסם", mode:"סביבה", live:"סביבה אמיתית", test:"Sandbox", save:"שמירת ההגדרות", saved:"ההגדרות המוצפנות נשמרו. התחילו הפעלה לבדיקת החיבור.", setup:"להפעלה אמיתית: הוסיפו יתרה ב-Didit ופרסמו תהליך עם OCR ו-PHONE_VERIFICATION ו-SMS לפלסטין וישראל. השתמשו במפתח של הסביבה המתאימה.", error:"לא ניתן להתחבר לשירות האימות. נסו שוב או בדקו את ההגדרות.", limited:"הגעתם למגבלת הניסיונות. המתינו לפני ניסיון נוסף.", auth:"התחברו שוב.", provider:"בדקו את מפתח Didit וההרשאות.", balance:"נדרשת יתרה ב-Didit להפעלת SMS.", invalid:"הזינו מפתח ומזהה תהליך שפורסם התואמים לסביבה.", updated:"עדכון אחרון", loading:"טוען…" },
  en: { title:"Identity & phone verification", note:"Verify an identity document, then confirm your phone with an SMS code through Didit. Document images stay at Didit; we retain only the session reference and check statuses.", start:"Start verification", resume:"Continue on Didit", refresh:"Refresh result", doc:"Identity document", phone:"Phone by SMS", verified:"Verified", pending:"Verification incomplete", missing:"Verification is not configured yet. Contact program administration.", sandbox:"Test mode: simulated results do not count as real verification and no real SMS is sent.", config:"Didit setup — program administration", key:"API Key", workflow:"Published Workflow ID", mode:"Environment", live:"Live", test:"Sandbox", save:"Save integration", saved:"Encrypted settings saved. Start a session to check the connection.", setup:"For live service: top up your Didit organization and publish a workflow with OCR and PHONE_VERIFICATION using SMS for Palestine and Israel. Use the API key for the matching environment.", error:"Unable to connect to verification. Try again or check the settings.", limited:"Attempt limit reached. Wait before retrying.", auth:"Sign in again.", provider:"Check the Didit API key and permissions.", balance:"Your Didit account needs credit to enable SMS.", invalid:"Enter a valid API key and a published workflow ID matching the environment.", updated:"Last updated", loading:"Loading…" },
};
const statuses: Record<string, [string,string,string]> = {
  "Not Started":["لم يبدأ","לא התחיל","Not started"], "In Progress":["قيد التنفيذ","בתהליך","In progress"], "In Review":["قيد المراجعة","בבדיקה","In review"], "Approved":["مقبول","אושר","Approved"], "Declined":["مرفوض","נדחה","Declined"], "Expired":["منتهي","פג תוקף","Expired"], "Abandoned":["غير مكتمل","לא הושלם","Abandoned"], "Kyc Expired":["انتهت صلاحية التحقق","פג תוקף האימות","Verification expired"], "Resubmitted":["إعادة تقديم","הוגש מחדש","Resubmitted"], "Awaiting User":["بانتظارك","ממתין לכם","Awaiting you"], "Not Finished":["غير مكتمل","לא הושלם","Not finished"],
};
type Verification = { status:string; documentStatus:string; phoneStatus:string; environment:string; verified:boolean; url:string|null; updatedAt:string };
type State = { configured:boolean; environment:string|null; verification:Verification|null };
export default function VerificationPanel({lang,isSuperAdmin=false}:{lang:"ar"|"he"|"en";isSuperAdmin?:boolean}) {
  const t=copy[lang]; const index=lang==="ar"?0:lang==="he"?1:2;
  const [state,setState]=useState<State|null>(null),[busy,setBusy]=useState(false),[error,setError]=useState("");
  const [key,setKey]=useState(""),[workflow,setWorkflow]=useState(SANDBOX_WORKFLOW_ID),[mode,setMode]=useState("sandbox"),[message,setMessage]=useState("");
  const describe=(code:string)=>code==="rate_limited"?t.limited:code==="auth_required"?t.auth:code==="provider_auth"?t.provider:code==="provider_balance"?t.balance:code==="not_configured"?t.missing:code==="invalid_request"?t.invalid:t.error;
  const load=useCallback(async()=>{
    const response=await authFetch("/api/verification");
    if(!response.ok) throw new Error("auth_required");
    setState(await response.json() as State);
  },[]);
  useEffect(()=>{
    let mounted=true;
    void authFetch("/api/verification").then(async response=>{
      if(!response.ok)throw new Error("auth_required");
      let next=await response.json() as State;
      // The return URL triggers a server lookup, never an approval from URL parameters.
      if(next.configured&&next.verification&&new URLSearchParams(window.location.search).get("verification")==="return") {
        window.history.replaceState(null,"",window.location.pathname);
        const refreshed=await authFetch("/api/verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action:"refresh"})});
        if(refreshed.ok){const data=await refreshed.json() as {verification:Verification|null};next={...next,verification:data.verification};}
      }
      if(mounted)setState(next);
    }).catch(()=>{if(mounted)setError(copy[lang].error);});
    return()=>{mounted=false;};
  },[lang]);
  useEffect(()=>{
    if(!isSuperAdmin)return;
    authFetch("/api/admin/verification-settings").then(async r=>{if(!r.ok)return;const d=await r.json() as {workflowId:string;environment:string};setWorkflow(d.workflowId);setMode(d.environment);}).catch(()=>setError(t.error));
  },[isSuperAdmin,t.error]);
  const act=async(action:"start"|"refresh")=>{
    setBusy(true);setError("");
    try {
      const response=await authFetch("/api/verification",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({action,language:lang})});
      const data=await response.json() as {error?:string;verification:Verification|null}; if(!response.ok)throw new Error(data.error);
      setState(previous=>previous?{...previous,verification:data.verification}:previous);
    }catch(e){setError(describe(e instanceof Error?e.message:""));}finally{setBusy(false);}
  };
  const save=async()=>{
    setBusy(true);setError("");setMessage("");
    try {
      const response=await authFetch("/api/admin/verification-settings",{method:"PUT",headers:{"Content-Type":"application/json"},body:JSON.stringify({apiKey:key,workflowId:workflow,environment:mode})});
      const data=await response.json() as {error?:string};if(!response.ok)throw new Error(data.error);
      setKey("");setMessage(t.saved);await load();
    }catch(e){setError(describe(e instanceof Error?e.message:""));}finally{setBusy(false);}
  };
  const v=state?.verification; const label=(value:string)=>statuses[value]?.[index]??statuses["Not Started"][index];
  return <section className="panel verification-panel" aria-busy={busy}>
    <div className="panel-heading"><div><h2><ShieldCheck size={20}/>{t.title}</h2><p>{t.note}</p></div><span className={`license-state ${v?.verified?"active":"pending"}`}>{v?.verified?t.verified:t.pending}</span></div>
    {state?.environment==="sandbox"&&<p className="verification-notice">{t.sandbox}</p>}
    {!state?<p>{t.loading}</p>:!state.configured?<p className="verification-notice">{t.missing}</p>:<>
      <div className="verification-checks"><div><FileCheck2 size={22}/><span>{t.doc}</span><b>{label(v?.documentStatus??"Not Started")}</b></div><div><Smartphone size={22}/><span>{t.phone}</span><b>{label(v?.phoneStatus??"Not Started")}</b></div></div>
      {v&&<p className="sms-note">{label(v.status)} · {t.updated}: <time>{new Intl.DateTimeFormat(lang,{dateStyle:"short",timeStyle:"short"}).format(new Date(v.updatedAt.replace(" ","T")+"Z"))}</time></p>}
      <div className="verification-actions">{!v?.verified&&!v?.url&&<button className="button button-primary" disabled={busy} onClick={()=>void act("start")}>{t.start}</button>}{v?.url&&<a className="button button-primary" href={v.url} target="_blank" rel="noopener noreferrer"><ExternalLink size={16}/>{t.resume}</a>}{v&&<button className="button button-outline" disabled={busy} onClick={()=>void act("refresh")}><RefreshCw size={16}/>{t.refresh}</button>}</div>
    </>}
    {error&&<p role="alert" className="error-banner">{error}</p>}{message&&<p role="status">{message}</p>}
    {isSuperAdmin&&<details className="verification-admin"><summary>{t.config}</summary><p>{t.setup}</p><div className="sms-fields"><label className="form-label">{t.mode}<select value={mode} onChange={e=>{setMode(e.target.value);setWorkflow(e.target.value==="sandbox"?SANDBOX_WORKFLOW_ID:"");}}><option value="sandbox">{t.test}</option><option value="live">{t.live}</option></select></label><label className="form-label">{t.workflow}<input dir="ltr" value={workflow} onChange={e=>setWorkflow(e.target.value.trim())}/></label><label className="form-label">{t.key}<input dir="ltr" type="password" autoComplete="new-password" value={key} onChange={e=>setKey(e.target.value.trim())}/></label><button className="button button-primary" disabled={busy||!key||!workflow} onClick={()=>void save()}>{t.save}</button></div></details>}
  </section>;
}
