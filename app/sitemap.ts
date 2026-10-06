import type {MetadataRoute} from "next";
import {env} from "cloudflare:workers";
export const dynamic="force-dynamic";
const origin="https://clinic-ops-palestine.nbeelsalah4.chatgpt.site";
export default async function sitemap():Promise<MetadataRoute.Sitemap>{
 const staticPages:MetadataRoute.Sitemap=[{url:origin,changeFrequency:"weekly",priority:1}];
 try{if(!env.DB)return staticPages;const result=await env.DB.prepare("SELECT public_slug FROM clinics WHERE public_enabled=1 AND public_slug IS NOT NULL ORDER BY name LIMIT 5000").all<{public_slug:string}>();return [...staticPages,...result.results.map(({public_slug})=>({url:`${origin}/c/${public_slug}`,changeFrequency:"weekly" as const,priority:.7}))];}catch{return staticPages;}
}
