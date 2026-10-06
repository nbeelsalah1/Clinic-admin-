"use client";

import { useEffect, useState } from "react";
import { Building2, Clock3, FileText, Save, Settings2 } from "lucide-react";
import {label,specialties,specialtyKeys,type SpecialtyKey} from "../lib/ops-model";
import { authFetch } from "./auth-client";

type Language = "ar" | "he" | "en";
type Settings = { primarySpecialty:SpecialtyKey;enabledSpecialties:SpecialtyKey[];name: string; contactPhone: string; contactEmail: string; contactAddress: string; defaultAppointmentMinutes: number; invoicePrefix: string; invoiceFooter: string; defaultTaxBps: number };
const initial: Settings = { primarySpecialty:"general",enabledSpecialties:[...specialtyKeys],name: "", contactPhone: "", contactEmail: "", contactAddress: "", defaultAppointmentMinutes: 20, invoicePrefix: "INV", invoiceFooter: "", defaultTaxBps: 0 };
const copy = {
  ar: { title: "إعدادات مدير العيادة", sub: "حدّث بيانات التواصل، ومدد المواعيد، وتنسيق الفواتير الافتراضي.", clinic: "بيانات العيادة", name: "اسم العيادة", phone: "هاتف التواصل", email: "بريد التواصل", address: "العنوان", appointments: "المواعيد", duration: "مدة الموعد الافتراضية بالدقائق", billing: "الفواتير", prefix: "بادئة رقم الفاتورة", tax: "الضريبة الافتراضية (%)", footer: "ملاحظة أسفل الفاتورة", taxNote: "القيمة الافتراضية صفر. اضبط الضريبة بما يتوافق مع الوضع الضريبي للعيادة، وراجع المحاسب قبل استخدامها.", save: "حفظ إعدادات العيادة", loading: "جارٍ تحميل الإعدادات…", saved: "حُفظت إعدادات العيادة", error: "تعذر حفظ الإعدادات. تحقق من الاتصال ثم أعد المحاولة.", permission: "إدارة إعدادات العيادة متاحة لمدير العيادة فقط." },
  he: { title: "הגדרות מנהל המרפאה", sub: "עדכון פרטי קשר, משכי תורים ופרטי ברירת מחדל לחשבוניות.", clinic: "פרטי המרפאה", name: "שם המרפאה", phone: "טלפון ליצירת קשר", email: "דוא״ל ליצירת קשר", address: "כתובת", appointments: "תורים", duration: "משך ברירת מחדל לתור בדקות", billing: "חשבוניות", prefix: "קידומת מספר חשבונית", tax: "מס ברירת מחדל (%)", footer: "הערה בתחתית החשבונית", taxNote: "ברירת המחדל היא אפס. התאימו את המס למעמד המרפאה והתייעצו עם רואה החשבון לפני השימוש.", save: "שמירת הגדרות המרפאה", loading: "טוען הגדרות…", saved: "הגדרות המרפאה נשמרו", error: "לא ניתן לשמור. בדקו את החיבור ונסו שוב.", permission: "רק מנהל המרפאה יכול לשנות הגדרות אלה." },
  en: { title: "Clinic administrator settings", sub: "Update clinic contact details, appointment defaults and invoice formatting.", clinic: "Clinic details", name: "Clinic name", phone: "Contact phone", email: "Contact email", address: "Address", appointments: "Appointments", duration: "Default appointment length in minutes", billing: "Invoices", prefix: "Invoice number prefix", tax: "Default tax (%)", footer: "Invoice footer note", taxNote: "The default is zero. Set tax to match the clinic’s tax status and consult your accountant before using it.", save: "Save clinic settings", loading: "Loading settings…", saved: "Clinic settings saved", error: "Could not save settings. Check your connection and try again.", permission: "Only the clinic administrator can change these settings." },
} satisfies Record<Language, Record<string, string>>;

export default function ClinicSettingsPanel({ lang, role }: { lang: Language; role: string }) {
  const t = copy[lang];
  const [settings, setSettings] = useState<Settings>(initial);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    void authFetch("/api/clinic-settings").then(async (response) => {
      const data = await response.json() as { settings?: Partial<Settings> };
      if (active && response.ok && data.settings) setSettings({ ...initial, ...data.settings });
    }).catch(() => { if (active) setMessage(t.error); }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [t.error]);

  async function save() {
    setSaving(true); setMessage("");
    try {
      const response = await authFetch("/api/clinic-settings", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(settings) });
      const data = await response.json() as { error?: string; settings?: Settings };
      if (!response.ok) throw new Error(data.error ?? t.error);
      if (data.settings) setSettings(data.settings);
      setMessage(t.saved);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t.error);
    } finally { setSaving(false); }
  }

  const update = (key: keyof Settings, value: string | number | SpecialtyKey[]) => setSettings((previous) => ({ ...previous, [key]: value }));
  return <section className="panel clinic-settings-panel">
    <div className="panel-heading"><div><h2><Settings2 size={19}/>{t.title}</h2><p>{t.sub}</p></div></div>
    {loading ? <p>{t.loading}</p> : <>
      <h3 className="clinic-settings-heading"><Building2 size={17}/>{t.clinic}</h3>
      <div className="ops-fields">
        <label className="form-label">{t.name}<input value={settings.name} maxLength={160} onChange={(event) => update("name", event.target.value)}/></label>
        <label className="form-label">{t.phone}<input dir="ltr" value={settings.contactPhone} maxLength={40} onChange={(event) => update("contactPhone", event.target.value)}/></label>
        <label className="form-label">{t.email}<input dir="ltr" type="email" value={settings.contactEmail} maxLength={254} onChange={(event) => update("contactEmail", event.target.value)}/></label>
        <label className="form-label ops-wide">{t.address}<input value={settings.contactAddress} maxLength={300} onChange={(event) => update("contactAddress", event.target.value)}/></label>
      </div>
      <h3 className="clinic-settings-heading"><Settings2 size={17}/>{lang==='ar'?'تخصصات العيادة':lang==='he'?'מומחיות המרפאה':'Clinic specialties'}</h3>
      <div className="ops-fields"><label className="form-label">{lang==='ar'?'التخصص الرئيسي':lang==='he'?'מומחיות ראשית':'Primary specialty'}<select value={settings.primarySpecialty} onChange={e=>update('primarySpecialty',e.target.value)}>{settings.enabledSpecialties.map(k=><option key={k} value={k}>{label(specialties[k].title,lang)}</option>)}</select></label><div className="form-label ops-wide">{lang==='ar'?'التخصصات المتاحة للفريق':lang==='he'?'מומחיות הזמינות לצוות':'Specialties available to the team'}<div className="specialty-checks">{specialtyKeys.map(k=><label key={k}><input type="checkbox" checked={settings.enabledSpecialties.includes(k)} disabled={k===settings.primarySpecialty} onChange={e=>update('enabledSpecialties',e.target.checked?[...settings.enabledSpecialties,k]:settings.enabledSpecialties.filter(v=>v!==k))}/>{label(specialties[k].title,lang)}</label>)}</div></div></div>
      <h3 className="clinic-settings-heading"><Clock3 size={17}/>{t.appointments}</h3>
      <div className="ops-fields"><label className="form-label">{t.duration}<input type="number" min={5} max={480} step={5} value={settings.defaultAppointmentMinutes} onChange={(event) => update("defaultAppointmentMinutes", Number(event.target.value))}/></label></div>
      <h3 className="clinic-settings-heading"><FileText size={17}/>{t.billing}</h3>
      <div className="ops-fields">
        <label className="form-label">{t.prefix}<input dir="ltr" value={settings.invoicePrefix} maxLength={10} onChange={(event) => update("invoicePrefix", event.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g, ""))}/></label>
        <label className="form-label">{t.tax}<input type="number" min={0} max={100} step="0.01" value={settings.defaultTaxBps / 100} onChange={(event) => update("defaultTaxBps", Math.round(Number(event.target.value) * 100))}/></label>
        <label className="form-label ops-wide">{t.footer}<textarea maxLength={500} value={settings.invoiceFooter} onChange={(event) => update("invoiceFooter", event.target.value)}/></label>
      </div>
      <p className="clinic-settings-note">{t.taxNote}</p>
      {role !== "clinic_admin" && <p className="clinic-settings-note">{t.permission}</p>}
      {role === "clinic_admin" && <div className="verification-actions"><button className="button button-primary" disabled={saving} onClick={() => void save()}><Save size={16}/>{t.save}</button></div>}
      {message && <p className="subscriber-notice" role="status">{message}</p>}
    </>}
  </section>;
}
