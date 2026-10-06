import type {MetadataRoute} from "next";
export default function robots():MetadataRoute.Robots{return {rules:{userAgent:"*",allow:"/",disallow:"/api/"},sitemap:"https://clinic-ops-palestine.nbeelsalah4.chatgpt.site/sitemap.xml"};}
