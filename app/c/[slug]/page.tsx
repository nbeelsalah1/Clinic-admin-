import type { Metadata } from "next";
import { env } from "cloudflare:workers";
import PublicClinic from "../../public-clinic";

export const dynamic = "force-dynamic";
type PageProps={params:Promise<{slug:string}>};
const specialtyLabels:Record<string,string>={general:"طب عام",dental:"طب الأسنان",obstetrics:"النساء والتوليد",pediatrics:"طب الأطفال",dermatology:"الأمراض الجلدية",physiotherapy:"العلاج الطبيعي",ophthalmology:"طب العيون"};

export async function generateMetadata({params}:PageProps):Promise<Metadata>{
 const {slug}=await params;
 try{
  if(!env.DB)return {title:"صفحة العيادة غير متاحة",robots:{index:false,follow:false}};
  const clinic=await env.DB.prepare("SELECT name,primary_specialty,public_description,public_seo_title,public_seo_description,public_address,public_enabled FROM clinics WHERE public_slug=?").bind(slug).first<{name:string;primary_specialty:string;public_description:string;public_seo_title:string;public_seo_description:string;public_address:string;public_enabled:number}>();
  if(!clinic||!clinic.public_enabled)return {title:"صفحة العيادة غير متاحة",robots:{index:false,follow:false}};
  const title=clinic.public_seo_title.trim()||`${clinic.name} — ${specialtyLabels[clinic.primary_specialty]??"عيادة طبية"} | عيادتي`;
  const description=(clinic.public_seo_description.trim()||clinic.public_description.trim()||`معلومات التواصل والخدمات في ${clinic.name}.`).slice(0,300);
  const keywords=[clinic.name,specialtyLabels[clinic.primary_specialty]??"عيادة طبية",clinic.public_address,"عيادة في فلسطين"].filter(Boolean);
  return {title:{absolute:title},description,keywords,alternates:{canonical:`/c/${slug}`},openGraph:{type:"website",locale:"ar_PS",siteName:"عيادتي",title,description,url:`/c/${slug}`},robots:{index:true,follow:true}};
 }catch{return {title:"صفحة العيادة",robots:{index:false,follow:false}};}
}
export default async function ClinicPage({params}:PageProps){const {slug}=await params;return <PublicClinic slug={slug}/>;}
