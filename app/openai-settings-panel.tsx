'use client';
import {useEffect,useState} from 'react';
import {authFetch} from './auth-client';
import {KeyRound,Save} from 'lucide-react';

type Language='ar'|'he'|'en';
const copy={
 ar:{title:'ربط OpenAI',note:'أدخل مفتاح API من منصة OpenAI لتفعيل المساعد الطبي والإدخال الصوتي. يُحفظ مشفرًا ويستخدمه النظام لجميع العيادات.',key:'مفتاح OpenAI API',placeholder:'sk-…',save:'حفظ المفتاح',saved:'تم حفظ المفتاح مشفرًا. أصبحت الخدمة مهيأة.',configured:'المفتاح محفوظ',missing:'لم يُضف مفتاح بعد',charges:'قد تترتب رسوم حسب استخدام واجهة OpenAI.',error:'تعذر حفظ المفتاح. تحقق منه ومن إعداد التشفير.'},
 he:{title:'חיבור OpenAI',note:'הזינו מפתח API מפלטפורמת OpenAI להפעלת העוזר הרפואי והקלטה קולית. המפתח נשמר מוצפן ומשותף לכל המרפאות.',key:'מפתח OpenAI API',placeholder:'sk-…',save:'שמירת המפתח',saved:'המפתח נשמר מוצפן והשירות מוגדר.',configured:'המפתח שמור',missing:'טרם נוסף מפתח',charges:'השימוש ב-OpenAI API עשוי להיות כרוך בתשלום.',error:'לא ניתן לשמור את המפתח. בדקו אותו ואת הגדרות ההצפנה.'},
 en:{title:'Connect OpenAI',note:'Enter an OpenAI Platform API key to enable clinical notes and voice transcription. It is stored encrypted and used across clinics.',key:'OpenAI API key',placeholder:'sk-…',save:'Save key',saved:'Key saved encrypted. The service is configured.',configured:'Key saved',missing:'No key added yet',charges:'OpenAI API usage may incur charges.',error:'Could not save the key. Check it and the encryption settings.'},
} satisfies Record<Language,Record<string,string>>;

export default function OpenAISettingsPanel({lang}:{lang:Language}){
 const t=copy[lang],[apiKey,setApiKey]=useState(''),[configured,setConfigured]=useState(false),[busy,setBusy]=useState(false),[error,setError]=useState(''),[success,setSuccess]=useState('');
 const refresh=async()=>{const r=await authFetch('/api/admin/openai-settings');if(!r.ok)throw new Error();const d=await r.json() as {configured?:boolean};setConfigured(Boolean(d.configured));};
 useEffect(()=>{void refresh().catch(()=>setError(t.error));},[t.error]);
 const save=async()=>{setBusy(true);setError('');setSuccess('');try{const r=await authFetch('/api/admin/openai-settings',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({apiKey})});if(!r.ok)throw new Error();setApiKey('');await refresh();setSuccess(t.saved);}catch{setError(t.error);}finally{setBusy(false);}};
 return <section className="panel subscriber-panel"><div className="panel-heading"><div><h2><KeyRound size={20}/>{t.title}</h2><p>{t.note}</p></div></div><p className="subscriber-notice" role="status">{configured?t.configured:t.missing}</p><label className="form-label">{t.key}<input type="password" dir="ltr" autoComplete="new-password" value={apiKey} placeholder={configured?'••••••••••••':t.placeholder} maxLength={512} onChange={e=>setApiKey(e.target.value.trim())}/></label><p className="sms-note">{t.charges}</p><button className="button button-primary" disabled={busy||apiKey.length<23} onClick={()=>void save()}><Save size={16}/>{t.save}</button>{error&&<p role="alert" className="error-banner">{error}</p>}{success&&<p role="status">{success}</p>}</section>;
}
